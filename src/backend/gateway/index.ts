/**
 * Team MCP Gateway - Main Entry Point
 *
 * This is the data plane process that:
 * 1. Manages connections to local MCP servers (stdio/HTTP)
 * 2. Exposes a unified MCP endpoint via Streamable HTTP
 * 3. Handles authentication (Tailscale identity + Ed25519 tokens)
 * 4. Enforces authorization policies
 * 5. Logs all activity
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { GatewayConfig, loadConfigFromEnv, mergeConfig, DEFAULT_GATEWAY_CONFIG } from '../shared/config.js'
import { createDatabase, runMigrations, createRepositories, Repositories } from './db/index.js'
import { MCPClientManager } from './mcp/client.js'
import { MCPProxyServer } from './mcp/server.js'
import { AuthManager, createAuthManager } from './auth/auth.js'
import { PolicyEngine } from './authz/policy.js'
import { ServerConfigSchema, TransportType } from '../shared/protocol.js'
import { PolicyDocumentSchema } from '../shared/policy.js'
import type { PolicyDocument, PolicyRule } from '../shared/policy.js'
import { normalizePeerUrl, peerHost } from '../shared/peer.js'
import { resolveHealthStatus } from './health.js'
import { ZodError } from 'zod'
import type { ActivityQuery, ServerHealth } from '../shared/activity.js'
import type { ShareInfo } from '../shared/types.js'
import pino from 'pino'

const logger = pino({ name: 'gateway' })

export interface GatewayServices {
  config: GatewayConfig
  db: ReturnType<typeof createDatabase>
  repos: Repositories
  clientManager: MCPClientManager
  proxyServer: MCPProxyServer
  authManager: AuthManager
  policyEngine: PolicyEngine
}

// Context passed to HTTP request handlers
interface HttpContext {
  proxyServer: MCPProxyServer
  authManager: AuthManager
  policyEngine: PolicyEngine
  repos: Repositories
  clientManager: MCPClientManager
  config: GatewayConfig
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) {
    body += chunk
  }
  if (!body) return {}
  return JSON.parse(body) as Record<string, unknown>
}

export class Gateway {
  private services: GatewayServices | null = null
  private httpServer: ReturnType<typeof createServer> | null = null
  private shuttingDown = false

  constructor(private readonly configOverrides: Partial<GatewayConfig> = {}) {}

  async start(): Promise<void> {
    logger.info('Starting Team MCP Gateway...')

    // Load configuration
    const envConfig = loadConfigFromEnv()
    const config = mergeConfig(DEFAULT_GATEWAY_CONFIG, this.configOverrides, envConfig)

    // Set log level
    logger.level = config.logLevel

    // Initialize database
    const db = createDatabase(config)
    runMigrations(db)
    const repos = createRepositories(db)

    // Initialize auth manager (signing key will be loaded from Electron main via IPC in production)
    const authManager = createAuthManager(config, repos.revokedTokens)
    await authManager.initialize() // In production, pass private key from safeStorage

    // Initialize policy engine
    const policyDoc = repos.policy.get()
    const policyEngine = new PolicyEngine(policyDoc)

    // Ensure the bootstrap policy rules exist so local development and tailnet
    // teammates work out of the box. This is idempotent, so a database created by
    // an older build also picks up newly added defaults.
    const bootstrapRules: PolicyRule[] = [
      {
        id: 'bootstrap-local',
        name: 'Bootstrap: local development',
        identities: [{ user: 'local@dev', device: '', deviceId: '', tailnet: '' }],
        effect: 'allow',
        priority: 100,
        description:
          'Allows the local loopback identity full access. Edit or remove in the Policy page.',
      },
      {
        id: 'bootstrap-tailnet',
        name: 'Bootstrap: tailnet peers',
        // An empty identity list matches any authenticated identity.
        identities: [],
        effect: 'allow',
        priority: 90,
        description:
          'Allows teammates who authenticated over the tailnet. Add higher-priority deny rules to restrict.',
      },
    ]

    const missingRules = bootstrapRules.filter(
      rule => !policyDoc.rules.some(existing => existing.id === rule.id)
    )
    if (missingRules.length > 0) {
      const seeded: PolicyDocument = {
        ...policyDoc,
        rules: [...policyDoc.rules, ...missingRules],
        updatedAt: Date.now(),
        updatedBy: 'system',
      }
      repos.policy.set(seeded)
      policyEngine.updatePolicy(seeded)
      logger.info({ rules: missingRules.map(r => r.id) }, 'Seeded bootstrap policy rules')
    }

    // Initialize MCP client manager
    const clientManager = new MCPClientManager(config)

    // Connect to registered servers
    const servers = repos.servers.getEnabled()
    logger.info({ count: servers.length }, 'Connecting to registered MCP servers')
    for (const server of servers) {
      try {
        await clientManager.connect(server)
      } catch (error) {
        logger.error({ serverId: server.id, error }, 'Failed to connect to server')
        repos.health.recordFailure(server.id, error instanceof Error ? error.message : String(error))
      }
    }

    // Start health checks
    clientManager.startHealthChecks(30000)

    // Initialize proxy server
    const proxyServer = new MCPProxyServer({
      config,
      clientManager,
      policyEngine,
      authManager,
      activityRepo: repos.activity,
      healthRepo: repos.health,
    })

    await proxyServer.start()

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      void this.handleHttpRequest(req, res, {
        proxyServer,
        authManager,
        policyEngine,
        repos,
        clientManager,
        config,
      })
    })

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject)
      this.httpServer!.listen(config.port, config.bindAddr, () => resolve())
    })

    this.services = {
      config,
      db,
      repos,
      clientManager,
      proxyServer,
      authManager,
      policyEngine,
    }

    logger.info({ port: config.port, bindAddr: config.bindAddr }, 'Gateway started')

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown())
    process.on('SIGINT', () => this.shutdown())
  }

  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: HttpContext
  ): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname

    try {
      // MCP Streamable HTTP endpoint (all sessions handled by the proxy)
      if (path === '/mcp' || path.startsWith('/mcp/')) {
        await ctx.proxyServer.handleRequest(req, res)
        return
      }

      if (path === '/health') {
        sendJson(res, 200, { status: 'ok', ...ctx.proxyServer.getStatus() })
        return
      }

      if (path === '/auth/token' && req.method === 'POST') {
        await this.handleTokenExchange(req, res, ctx.authManager)
        return
      }

      if (path === '/policy' && req.method === 'GET') {
        sendJson(res, 200, ctx.policyEngine.getPolicy())
        return
      }

      if (path.startsWith('/api/')) {
        await this.handleApiRequest(req, res, url, ctx)
        return
      }

      sendJson(res, 404, { error: 'Not Found' })
    } catch (error) {
      // Client-side errors (schema validation / malformed body) must not surface as 500.
      if (error instanceof ZodError) {
        logger.warn({ path, issues: error.issues }, 'Request validation failed')
        if (!res.headersSent) {
          sendJson(res, 400, { error: 'Validation failed', issues: error.issues })
        }
        return
      }
      if (error instanceof SyntaxError) {
        logger.warn({ path, error: error.message }, 'Malformed request body')
        if (!res.headersSent) {
          sendJson(res, 400, { error: 'Malformed JSON body' })
        }
        return
      }
      logger.error({ error, path }, 'Request failed')
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  private async handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    ctx: HttpContext
  ): Promise<void> {
    const segments = url.pathname.split('/').filter(Boolean) // ['api', resource, id, action]
    const resource = segments[1]
    const id = segments[2]
    const action = segments[3]

    switch (resource) {
      case 'status': {
        const status = ctx.proxyServer.getStatus()
        sendJson(res, 200, {
          ...status,
          boundAddress: ctx.config.bindAddr,
          port: ctx.config.port,
          connectedPeers: status.activeSessions,
        })
        return
      }

      case 'servers':
        return this.handleServersApi(req, res, id, action, ctx)

      case 'share':
        return this.handleShareApi(req, res, ctx)

      case 'peers':
        return this.handlePeersApi(req, res, id, ctx)

      case 'policy':
        return this.handlePolicyApi(req, res, ctx)

      case 'activity':
        return this.handleActivityApi(req, res, url, id, ctx)

      case 'health': {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' })
        sendJson(res, 200, this.collectHealth(ctx))
        return
      }

      case 'tailscale': {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' })
        const available = ctx.authManager.isTailscaleReady()
        const info = available ? await ctx.authManager.getLocalInfo() : null
        sendJson(res, 200, {
          available,
          ip: info?.ip ?? null,
          hostname: info?.hostname ?? null,
          dnsName: info?.dnsName ?? null,
        })
        return
      }

      default:
        sendJson(res, 404, { error: 'Not Found' })
    }
  }

  private async handleServersApi(
    req: IncomingMessage,
    res: ServerResponse,
    id: string | undefined,
    action: string | undefined,
    ctx: HttpContext
  ): Promise<void> {
    const { repos, clientManager } = ctx

    // /api/servers
    if (!id) {
      if (req.method === 'GET') {
        sendJson(res, 200, repos.servers.getAll())
        return
      }
      if (req.method === 'POST') {
        const body = await readJson(req)
        const parsed = ServerConfigSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(body)
        const created = repos.servers.create(parsed)
        if (created.enabled) {
          try {
            await clientManager.connect(created)
            repos.health.recordSuccess(created.id, 0)
          } catch (error) {
            repos.health.recordFailure(
              created.id,
              error instanceof Error ? error.message : String(error)
            )
          }
        }
        sendJson(res, 201, created)
        return
      }
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    const existing = repos.servers.getById(id)
    if (!existing) {
      sendJson(res, 404, { error: `Server not found: ${id}` })
      return
    }

    // /api/servers/:id
    if (!action) {
      if (req.method === 'GET') {
        sendJson(res, 200, existing)
        return
      }
      if (req.method === 'PUT') {
        const body = await readJson(req)
        const updates = ServerConfigSchema.omit({ id: true, createdAt: true, updatedAt: true })
          .partial()
          .parse(body)
        const updated = repos.servers.update(id, updates)
        if (updated) {
          try {
            if (updated.enabled) await clientManager.connect(updated)
            else await clientManager.disconnect(updated.id)
          } catch (error) {
            repos.health.recordFailure(
              updated.id,
              error instanceof Error ? error.message : String(error)
            )
          }
        }
        sendJson(res, 200, updated)
        return
      }
      if (req.method === 'DELETE') {
        await clientManager.disconnect(id)
        const ok = repos.servers.delete(id)
        sendJson(res, 200, { success: ok })
        return
      }
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    // /api/servers/:id/:action
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    switch (action) {
      case 'connect':
        await clientManager.connect(existing)
        repos.health.recordSuccess(id, 0)
        sendJson(res, 200, { success: true })
        return
      case 'disconnect':
        await clientManager.disconnect(id)
        sendJson(res, 200, { success: true })
        return
      case 'refresh': {
        await clientManager.refreshCapabilities(id)
        const conn = clientManager.getConnection(id)
        sendJson(res, 200, { success: true, tools: conn?.tools ?? [] })
        return
      }
      default:
        sendJson(res, 404, { error: `Unknown action: ${action}` })
    }
  }

  /**
   * Share info for the "expose" flow: what peers should connect to. (`GET /api/share`)
   */
  private async handleShareApi(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: HttpContext
  ): Promise<void> {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    const available = ctx.authManager.isTailscaleReady()
    const info = available ? await ctx.authManager.getLocalInfo() : null
    const status = ctx.proxyServer.getStatus()
    const bindAddress = ctx.config.bindAddr
    const localOnly =
      bindAddress === '127.0.0.1' || bindAddress === '::1' || bindAddress === 'localhost'

    const payload: ShareInfo = {
      running: status.running,
      address: `${bindAddress}:${ctx.config.port}`,
      mcpUrl: `http://${bindAddress}:${ctx.config.port}/mcp`,
      bindAddress,
      port: ctx.config.port,
      localOnly,
      connectedPeers: status.activeSessions,
      servers: ctx.repos.servers.getAll().length,
      tailscale: {
        available,
        ip: info?.ip ?? null,
        hostname: info?.hostname ?? null,
        dnsName: info?.dnsName ?? null,
      },
    }

    sendJson(res, 200, payload)
  }

  /**
   * Peer gateways: register/probe a teammate's exposed gateway as a
   * Streamable-HTTP upstream. (`POST /api/peers`, `DELETE /api/peers/:id`)
   */
  private async handlePeersApi(
    req: IncomingMessage,
    res: ServerResponse,
    id: string | undefined,
    ctx: HttpContext
  ): Promise<void> {
    const { repos, clientManager } = ctx

    // /api/peers — add (or probe) a peer.
    if (!id) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' })
        return
      }

      const body = await readJson(req)
      const address = typeof body.address === 'string' ? body.address : ''
      const probe = body.probe === true

      let url: string
      try {
        url = normalizePeerUrl(address)
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : 'Invalid peer address',
        })
        return
      }

      const host = peerHost(url)
      const created = repos.servers.create({
        name: `peer:${host}`,
        transport: TransportType.StreamableHttp,
        url,
        enabled: true,
        description: 'Remote Team MCP Gateway peer',
      })

      try {
        await clientManager.connect(created)
        repos.health.recordSuccess(created.id, 0)
      } catch (error) {
        await clientManager.disconnect(created.id).catch(() => undefined)
        repos.servers.delete(created.id)
        sendJson(res, 502, {
          error: `Could not reach ${host}: ${error instanceof Error ? error.message : String(error)}`,
        })
        return
      }

      const tools = (clientManager.getConnection(created.id)?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      }))

      // A probe validates reachability without keeping the peer registered.
      if (probe) {
        await clientManager.disconnect(created.id)
        repos.servers.delete(created.id)
        sendJson(res, 200, { success: true, probe: true, url, tools })
        return
      }

      sendJson(res, 201, { success: true, url, tools, server: created })
      return
    }

    // /api/peers/:id — remove a peer.
    if (req.method !== 'DELETE') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }
    await clientManager.disconnect(id)
    const ok = repos.servers.delete(id)
    sendJson(res, 200, { success: ok })
  }

  private async handlePolicyApi(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: HttpContext
  ): Promise<void> {
    if (req.method === 'GET') {
      sendJson(res, 200, ctx.repos.policy.get())
      return
    }
    if (req.method === 'PUT') {
      const body = await readJson(req)
      const policy = PolicyDocumentSchema.parse({ ...body, updatedAt: Date.now() })
      ctx.repos.policy.set(policy)
      ctx.policyEngine.updatePolicy(policy)
      sendJson(res, 200, { success: true, policy })
      return
    }
    sendJson(res, 405, { error: 'Method Not Allowed' })
  }

  private async handleActivityApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    id: string | undefined,
    ctx: HttpContext
  ): Promise<void> {
    if (id === 'stats' && req.method === 'GET') {
      const sinceParam = url.searchParams.get('since')
      sendJson(res, 200, ctx.repos.activity.getStats(sinceParam ? Number(sinceParam) : undefined))
      return
    }

    if (id === 'prune' && req.method === 'POST') {
      const body = await readJson(req)
      const olderThanMs =
        typeof body.olderThanMs === 'number'
          ? body.olderThanMs
          : Date.now() - 30 * 24 * 60 * 60 * 1000
      const count = ctx.repos.activity.prune(olderThanMs)
      sendJson(res, 200, { success: true, count })
      return
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    const q = url.searchParams
    const query: ActivityQuery = {
      limit: q.get('limit') ? Number(q.get('limit')) : 100,
      offset: q.get('offset') ? Number(q.get('offset')) : 0,
    }
    if (q.get('since')) query.since = Number(q.get('since'))
    if (q.get('until')) query.until = Number(q.get('until'))
    if (q.get('identity')) query.identity = q.get('identity')!
    if (q.get('deviceId')) query.deviceId = q.get('deviceId')!
    if (q.get('serverId')) query.serverId = q.get('serverId')!
    if (q.get('toolName')) query.toolName = q.get('toolName')!
    if (q.get('method')) query.method = q.get('method')!
    if (q.get('success') !== null) query.success = q.get('success') === 'true'
    const sortBy = q.get('sortBy')
    if (sortBy === 'timestamp' || sortBy === 'duration_ms') query.sortBy = sortBy
    const sortOrder = q.get('sortOrder')
    if (sortOrder === 'asc' || sortOrder === 'desc') query.sortOrder = sortOrder

    sendJson(res, 200, ctx.repos.activity.query(query))
  }

  private collectHealth(ctx: HttpContext): ServerHealth[] {
    const records = new Map(ctx.repos.health.getAll().map((h) => [h.serverId, h]))
    const connected = new Set(ctx.clientManager.getConnectedServers().map((c) => c.serverId))

    return ctx.repos.servers.getAll().map((server) => {
      const existing = records.get(server.id)
      const isConnected = connected.has(server.id)
      const status = resolveHealthStatus(isConnected, existing)
      const isFailing = status === 'unhealthy' || status === 'degraded'

      return {
        serverId: server.id,
        status,
        lastCheck: existing?.lastCheck,
        latencyMs: isConnected ? existing?.latencyMs : undefined,
        error: isFailing ? existing?.error : undefined,
        consecutiveFailures: isFailing ? existing?.consecutiveFailures ?? 0 : 0,
      }
    })
  }

  private async handleTokenExchange(
    req: IncomingMessage,
    res: ServerResponse,
    authManager: AuthManager
  ): Promise<void> {
    const body = await readJson(req)

    try {
      const clientIp = typeof body.clientIp === 'string' ? body.clientIp : '127.0.0.1'
      const result = await authManager.authenticateConnection(clientIp)
      sendJson(res, 200, result)
    } catch (error: unknown) {
      sendJson(res, 500, { success: false, error: String(error) })
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true

    logger.info('Shutting down gateway...')

    if (this.services) {
      await this.services.clientManager.disconnectAll()
      await this.services.proxyServer.shutdown()
      this.services.db.close()
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
    }

    logger.info('Gateway stopped')
    process.exit(0)
  }

  getServices(): GatewayServices | null {
    return this.services
  }
}

// CLI entry point
async function main() {
  const configOverrides: Partial<GatewayConfig> = {}

  // Parse command line args
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--port') configOverrides.port = parseInt(process.argv[++i], 10)
    else if (arg === '--bind') configOverrides.bindAddr = process.argv[++i]
    else if (arg === '--db') configOverrides.dbPath = process.argv[++i]
    else if (arg === '--log-level') configOverrides.logLevel = process.argv[++i] as GatewayConfig['logLevel']
  }

  const gateway = new Gateway(configOverrides)
  await gateway.start()
}

// CommonJS way to check if running as main
if (require.main === module) {
  main().catch(error => {
    logger.error({ error }, 'Gateway failed to start')
    process.exit(1)
  })
}