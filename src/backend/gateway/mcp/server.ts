/**
 * MCP Proxy Server - exposes a unified MCP endpoint to remote clients.
 * Acts as an MCP server that forwards requests to local MCP clients.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type CallToolResult,
  type ReadResourceResult as SdkReadResourceResult,
  type GetPromptResult as SdkGetPromptResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool, Resource, Prompt } from '../../shared/protocol.js'
import { parseNamespacedTool } from '../../shared/protocol.js'
import type { ActivityEntry } from '../../shared/activity.js'
import type { Identity, TokenClaims } from '../../shared/policy.js'
import { MCPClientManager } from './client.js'
import { PolicyEngine } from '../authz/policy.js'
import { AuthManager, AuthContext } from '../auth/auth.js'
import type { GatewayAccountService } from '../auth/accounts.js'
import { ActivityRepository, ServerHealthRepository } from '../db/repository.js'
import { GatewayConfig } from '../../shared/config.js'
import pino from 'pino'

const logger = pino({ name: 'mcp-proxy-server' })

export interface ProxyServerOptions {
  config: GatewayConfig
  clientManager: MCPClientManager
  policyEngine: PolicyEngine
  authManager: AuthManager
  accountService: GatewayAccountService
  activityRepo: ActivityRepository
  healthRepo: ServerHealthRepository
}

// ponytail: fixed idle window; make it configurable if clients poll less often.
const SESSION_IDLE_MS = 2 * 60 * 1000

export class MCPProxyServer {
  private options: ProxyServerOptions
  private sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>()
  private activeSessions = new Map<string, AuthContext>()
  /** Per-session liveness: open HTTP requests (incl. SSE streams) and last request time. */
  private liveness = new Map<string, { open: number; lastAt: number }>()
  private requestCount = 0
  private startTime?: number

  constructor(options: ProxyServerOptions) {
    this.options = options
  }

  private createServer(): Server {
    const server = new Server(
      {
        name: 'team-mcp-gateway',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
          logging: {},
        },
      }
    )

    // Initialize is handled automatically by the SDK Server (capabilities are
    // declared in the constructor), so we only register the feature handlers.

    // Handle tools/list
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.getAggregatedTools() }
    })

    // Handle tools/call
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const startTime = Date.now()
      const authContext = this.getAuthContext(extra.sessionId)

      if (!authContext) {
        throw new Error('Unauthorized: no valid session')
      }

      // Parse namespaced tool name
      const parsed = parseNamespacedTool(request.params.name)
      if (!parsed) {
        throw new Error(`Invalid tool name format: ${request.params.name}`)
      }

      const { serverId, toolName } = parsed

      // Check authorization
      const decision = this.options.policyEngine.evaluate(
        authContext.identity,
        serverId,
        toolName,
        'tools/call'
      )

      if (!decision.allowed) {
        await this.logActivity({
          identity: authContext.identity,
          method: 'tools/call',
          serverId,
          toolName,
          requestSummary: `${request.params.name}(${JSON.stringify(request.params.arguments)})`,
          responseSummary: 'DENIED: ' + decision.reason,
          success: false,
          errorCode: 403,
          errorMessage: decision.reason,
          durationMs: Date.now() - startTime,
        })

        throw new Error(`Access denied: ${decision.reason}`)
      }

      try {
        // Forward to local MCP client
        const result = await this.options.clientManager.callTool(serverId, {
          name: toolName,
          arguments: request.params.arguments as Record<string, unknown> | undefined,
        })

        // A tool can report failure via `isError` instead of throwing (MCP semantics);
        // reflect that in the activity log rather than recording it as a success.
        const toolFailed = result.isError === true
        const toolErrorText = toolFailed
          ? (result.content ?? [])
              .map((c) => (c.type === 'text' && typeof c.text === 'string' ? c.text : ''))
              .filter(Boolean)
              .join(' ')
              .slice(0, 500)
          : ''

        await this.logActivity({
          identity: authContext.identity,
          method: 'tools/call',
          serverId,
          toolName,
          requestSummary: `${request.params.name}(${JSON.stringify(request.params.arguments)})`,
          responseSummary: toolFailed
            ? `ERROR: ${toolErrorText || 'tool reported an error'}`
            : `OK (${JSON.stringify(result).length} chars)`,
          success: !toolFailed,
          errorMessage: toolFailed ? toolErrorText || undefined : undefined,
          durationMs: Date.now() - startTime,
        })

        this.requestCount++
        return result as CallToolResult
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await this.logActivity({
          identity: authContext.identity,
          method: 'tools/call',
          serverId,
          toolName,
          requestSummary: `${request.params.name}(${JSON.stringify(request.params.arguments)})`,
          responseSummary: `ERROR: ${errorMessage}`,
          success: false,
          errorCode: 500,
          errorMessage,
          durationMs: Date.now() - startTime,
        })

        this.options.healthRepo.recordFailure(serverId, errorMessage)
        throw error
      }
    })

    // Handle resources/list
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: this.getAggregatedResources() }
    })

    // Handle resources/read - resources are namespaced as `<serverId>://<uri>`
    server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
      const startTime = Date.now()
      const authContext = this.getAuthContext(extra.sessionId)
      if (!authContext) {
        throw new Error('Unauthorized: no valid session')
      }

      const { serverId, uri } = this.parseNamespacedResource(request.params.uri)
      const decision = this.options.policyEngine.evaluate(authContext.identity, serverId)
      if (!decision.allowed) {
        throw new Error(`Access denied: ${decision.reason}`)
      }

      const result = await this.options.clientManager.readResource(serverId, { uri })
      await this.logActivity({
        identity: authContext.identity,
        method: 'resources/read',
        serverId,
        requestSummary: `read_resource(uri="${uri}")`,
        responseSummary: 'OK',
        success: true,
        durationMs: Date.now() - startTime,
      })
      return result as unknown as SdkReadResourceResult
    })

    // Handle resources/subscribe
    server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
      const authContext = this.getAuthContext(extra.sessionId)
      if (!authContext) throw new Error('Unauthorized')

      const { serverId, uri } = this.parseNamespacedResource(request.params.uri)
      await this.options.clientManager.subscribeResource(serverId, uri)
      return {}
    })

    // Handle resources/unsubscribe
    server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
      const authContext = this.getAuthContext(extra.sessionId)
      if (!authContext) throw new Error('Unauthorized')

      const { serverId, uri } = this.parseNamespacedResource(request.params.uri)
      await this.options.clientManager.unsubscribeResource(serverId, uri)
      return {}
    })

    // Handle prompts/list
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: this.getAggregatedPrompts() }
    })

    // Handle prompts/get - prompts are namespaced as `<serverId>__<name>`
    server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
      const startTime = Date.now()
      const authContext = this.getAuthContext(extra.sessionId)
      if (!authContext) {
        throw new Error('Unauthorized: no valid session')
      }

      const parsed = parseNamespacedTool(request.params.name)
      if (!parsed) {
        throw new Error(`Invalid prompt name format: ${request.params.name}`)
      }
      const { serverId, toolName: promptName } = parsed

      const decision = this.options.policyEngine.evaluate(authContext.identity, serverId)
      if (!decision.allowed) {
        throw new Error(`Access denied: ${decision.reason}`)
      }

      const result = await this.options.clientManager.getPrompt(serverId, {
        name: promptName,
        arguments: request.params.arguments as Record<string, string> | undefined,
      })

      await this.logActivity({
        identity: authContext.identity,
        method: 'prompts/get',
        serverId,
        requestSummary: `get_prompt(name="${promptName}")`,
        responseSummary: 'OK',
        success: true,
        durationMs: Date.now() - startTime,
      })
      return result as unknown as SdkGetPromptResult
    })

    return server
  }

  private getAggregatedTools(): Tool[] {
    const aggregated = this.options.clientManager.getAggregatedTools()
    return aggregated.map(({ tool }) => tool)
  }

  private getAggregatedResources(): Resource[] {
    const resources: Resource[] = []
    for (const connection of this.options.clientManager.getConnectedServers()) {
      for (const resource of connection.resources) {
        resources.push({
          ...resource,
          uri: `${connection.serverId}://${resource.uri}`, // Namespace URI
        })
      }
    }
    return resources
  }

  private getAggregatedPrompts(): Prompt[] {
    const prompts: Prompt[] = []
    for (const connection of this.options.clientManager.getConnectedServers()) {
      for (const prompt of connection.prompts) {
        prompts.push({
          ...prompt,
          name: `${connection.serverId}__${prompt.name}`, // Namespace
        })
      }
    }
    return prompts
  }

  private getAuthContext(sessionId?: string): AuthContext | undefined {
    if (!sessionId) return undefined
    return this.activeSessions.get(sessionId)
  }

  private parseNamespacedResource(uri: string): { serverId: string; uri: string } {
    const idx = uri.indexOf('://')
    if (idx === -1) {
      throw new Error(`Invalid resource uri (missing server prefix): ${uri}`)
    }
    return { serverId: uri.slice(0, idx), uri: uri.slice(idx + 3) }
  }

  private async logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: Omit<ActivityEntry, 'id'> = {
      ...entry,
      timestamp: Date.now(),
    }
    this.options.activityRepo.insert(fullEntry)
  }

  /**
   * Register a session for a connected client.
   */
  registerSession(sessionId: string, authContext: AuthContext): void {
    this.activeSessions.set(sessionId, authContext)
  }

  /**
   * Unregister a session.
   */
  unregisterSession(sessionId: string): void {
    this.activeSessions.delete(sessionId)
  }

  async revokeAccountSessions(accountId: string): Promise<void> {
    const sessionIds = [...this.activeSessions]
      .filter(([, context]) => context.accountId === accountId)
      .map(([sessionId]) => sessionId)
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)
      this.activeSessions.delete(sessionId)
      this.sessions.delete(sessionId)
      if (!session) continue
      try {
        await session.transport.close()
        await session.server.close()
      } catch (error) {
        logger.warn({ error, sessionId, accountId }, 'Failed to close revoked account session')
      }
    }
  }

  /**
   * Live MCP sessions per Tailscale device id. Clients rarely send DELETE on
   * exit, so a session only counts while it holds an open stream or made a
   * request within SESSION_IDLE_MS.
   */
  sessionsByDevice(now = Date.now()): Map<string, number> {
    const counts = new Map<string, number>()
    for (const [sid, { identity }] of this.activeSessions) {
      const live = this.liveness.get(sid)
      if (!live || (live.open === 0 && now - live.lastAt > SESSION_IDLE_MS)) continue
      counts.set(identity.deviceId, (counts.get(identity.deviceId) ?? 0) + 1)
    }
    return counts
  }

  private touch(sid: string, res?: ServerResponse): void {
    const live = this.liveness.get(sid) ?? { open: 0, lastAt: 0 }
    live.lastAt = Date.now()
    this.liveness.set(sid, live)
    if (!res) return
    live.open++
    res.on('close', () => {
      live.open--
      live.lastAt = Date.now()
    })
  }

  private forget(sid: string): void {
    this.sessions.delete(sid)
    this.activeSessions.delete(sid)
    this.liveness.delete(sid)
  }

  /**
   * Close every open session for a device. The client may re-initialize;
   * use a policy deny rule to keep it out.
   */
  async closeSessionsForDevice(deviceId: string): Promise<number> {
    const sids = [...this.activeSessions]
      .filter(([, ctx]) => ctx.identity.deviceId === deviceId)
      .map(([sid]) => sid)
    for (const sid of sids) {
      await this.sessions.get(sid)?.transport.close()
      this.forget(sid)
    }
    return sids.length
  }

  /**
   * Start the proxy server.
   */
  async start(): Promise<void> {
    this.startTime = Date.now()
    logger.info('MCP proxy server ready')
  }

  /**
   * Handle an incoming Node HTTP request for the `/mcp` endpoint.
   * A new MCP session (server + transport) is created per initializing client.
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown
  ): Promise<void> {
    const headerSessionId = req.headers['mcp-session-id']
    const sessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId
    const existing = sessionId ? this.sessions.get(sessionId) : undefined
    if (existing && sessionId) {
      this.touch(sessionId, res)
      return existing.transport.handleRequest(req, res, parsedBody)
    }

    // Only an initialize POST can open a new session
    if (req.method !== 'POST') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: missing session' },
          id: null,
        })
      )
      return
    }

    const identity = await this.options.authManager.resolveClientIdentity(this.clientIp(req))
    const rawAccountId = req.headers['x-tether-account-id']
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId
    const localDevelopment = process.env.NODE_ENV !== 'production' &&
      (this.clientIp(req) === '127.0.0.1' || this.clientIp(req) === '::1')
    const account = identity && accountId
      ? this.options.accountService.authorize(accountId, identity)
      : undefined

    if ((!identity || (!account && !localDevelopment)) || (accountId && !account)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'An approved gateway account and matching Tailscale identity are required.' },
        id: null,
      }))
      return
    }

    const server = this.createServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        this.sessions.set(sid, { server, transport })
        this.activeSessions.set(sid, {
          identity: identity!,
          accountId: account?.id,
          token: '',
          claims: this.buildClaims(identity!),
        })
        this.touch(sid)
        logger.debug({ sessionId: sid }, 'Session initialized')
      },
      onsessionclosed: (sid) => this.forget(sid),
    })

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) this.forget(sid)
    }

    await server.connect(transport)
    return transport.handleRequest(req, res, parsedBody)
  }

  /**
   * Get the HTTP handler for integration with a Node HTTP server.
   */
  getHttpHandler() {
    return (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) =>
      this.handleRequest(req, res, parsedBody)
  }

  private clientIp(req: IncomingMessage): string {
    const rawIp = req.socket?.remoteAddress || '127.0.0.1'
    return rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp === '::1' ? '127.0.0.1' : rawIp
  }

  private buildClaims(identity: Identity): TokenClaims {
    const now = Math.floor(Date.now() / 1000)
    return {
      sub: `${identity.user}@${identity.tailnet}`,
      deviceId: identity.deviceId,
      iat: now,
      exp: now + 86400,
      permissions: { servers: [], tools: [] },
    }
  }

  /**
   * Get server status.
   */
  getStatus() {
    return {
      running: this.startTime !== undefined,
      startedAt: this.startTime,
      uptimeMs: this.startTime ? Date.now() - this.startTime : 0,
      activeSessions: this.activeSessions.size,
      totalRequests: this.requestCount,
      connectedServers: this.options.clientManager.getConnectedServers().length,
    }
  }

  /**
   * Shutdown the server.
   */
  async shutdown(): Promise<void> {
    for (const { server, transport } of this.sessions.values()) {
      try {
        await transport.close()
        await server.close()
      } catch (error) {
        logger.warn({ error }, 'Error closing session')
      }
    }
    this.sessions.clear()
    this.activeSessions.clear()
  }
}