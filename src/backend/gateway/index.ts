/**
 * Team MCP Gateway - Main Entry Point
 *
 * This is the data plane process that:
 * 1. Manages connections to local MCP servers (stdio/HTTP)
 * 2. Exposes a unified MCP endpoint via Streamable HTTP
 * 3. Enforces host-local approvals for verified Tailscale identities
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
import { GatewayApprovalService } from './auth/approvals.js'
import { PolicyEngine } from './authz/policy.js'
import type { PolicyDocument, PolicyRule } from '../shared/policy.js'
import { GatewayHttpRouter } from './http/routes.js'
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

/** True for addresses where a separate loopback listener is redundant/conflicting. */
function coversLoopback(addr: string): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === 'localhost' || addr === '0.0.0.0' || addr === '::'
}

export class Gateway {
  private services: GatewayServices | null = null
  private httpServer: ReturnType<typeof createServer> | null = null
  private loopbackServer: ReturnType<typeof createServer> | null = null
  private shuttingDown = false

  /** Create a gateway using optional configuration overrides. */
  constructor(private readonly configOverrides: Partial<GatewayConfig> = {}) {}

  /** Initialize persistence and services, then bind the configured and local listeners. */
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
    const approvalService = new GatewayApprovalService(repos.approvals)

    // Initialize Tailscale identity resolution and legacy token support.
    const authManager = createAuthManager(config, repos.revokedTokens)
    await authManager.initialize()
    const localIdentity = await authManager.resolveClientIdentity('127.0.0.1')
    if (localIdentity) approvalService.trustLocalHost(localIdentity)

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
    // Connect in the background: an unreachable upstream (e.g. an offline peer,
    // whose TCP connect can hang for minutes) must not keep the gateway from listening.
    for (const server of servers) {
      clientManager.connect(server).catch((error) => {
        logger.error({ serverId: server.id, error }, 'Failed to connect to server')
        repos.health.recordFailure(server.id, error instanceof Error ? error.message : String(error))
      })
    }

    // Start health checks
    clientManager.startHealthChecks(30000)

    // Initialize proxy server
    const proxyServer = new MCPProxyServer({
      config,
      clientManager,
      policyEngine,
      authManager,
      approvalService,
      activityRepo: repos.activity,
      healthRepo: repos.health,
    })

    await proxyServer.start()

    const router = new GatewayHttpRouter(logger)
    const httpContext = {
      proxyServer,
      authManager,
      approvalService,
      policyEngine,
      repos,
      clientManager,
      config,
    }
    const handleRequest = (req: IncomingMessage, res: ServerResponse): void => {
      void router.handleRequest(req, res, httpContext)
    }

    // Data plane: bind the configured interface (the tailnet IP when exposed).
    this.httpServer = createServer(handleRequest)
    await this.listenOn(this.httpServer, config.port, config.bindAddr)

    // Keep the management API available to the local Electron process without
    // exposing it to tailnet peers.
    if (!coversLoopback(config.bindAddr)) {
      this.loopbackServer = createServer(handleRequest)
      await this.listenOn(this.loopbackServer, config.port, '127.0.0.1')
    }

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

  /** Stop active clients and listeners before exiting the gateway process. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true

    logger.info('Shutting down gateway...')

    // Never let a hung cleanup keep the process (and its listening port) alive —
    // an orphaned gateway would block the next start with EADDRINUSE.
    const bail = setTimeout(() => {
      logger.warn('Gateway shutdown timed out — forcing exit')
      process.exit(0)
    }, 3000)
    bail.unref()

    try {
      if (this.services) {
        await this.services.clientManager.disconnectAll()
        await this.services.proxyServer.shutdown()
        this.services.db.close()
      }

      for (const server of [this.httpServer, this.loopbackServer]) {
        if (!server) continue
        // Force-close lingering (keep-alive / idle) connections so close() resolves.
        server.closeIdleConnections()
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    } catch (error) {
      logger.error({ error }, 'Error during shutdown')
    }

    clearTimeout(bail)
    logger.info('Gateway stopped')
    process.exit(0)
  }

  /** Bind a server to an interface, rejecting if it cannot listen. */
  private listenOn(
    server: ReturnType<typeof createServer>,
    port: number,
    host: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => resolve())
    })
  }

  /** Expose initialized services for integration and embedding use. */
  getServices(): GatewayServices | null {
    return this.services
  }
}

// CLI entry point
/** Parse command-line overrides and start the standalone gateway process. */
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