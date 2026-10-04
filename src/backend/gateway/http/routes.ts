import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'
import { ZodError } from 'zod'
import type { AuthManager } from '../auth/auth.js'
import { handleAccountDevices, handleAccountManagementApi, handlePublicAccountAuth } from './api/accounts.js'
import { isManagementRequestAllowed } from '../http-access.js'
import { handleActivityApi, handlePolicyApi } from './api/policy-activity.js'
import { handlePeersApi, handleShareApi, handleTailscaleApi } from './api/network.js'
import { handleServersApi } from './api/servers.js'
import { handleHealthApi, handleStatusApi } from './api/status.js'
import type { HttpContext } from './context.js'
import { CORS_HEADERS, sendJson } from './response.js'

export type { HttpContext } from './context.js'

/** Dispatch HTTP traffic after applying the shared management-access boundary. */
export class GatewayHttpRouter {
  /** Create a router with the gateway logger used for request failures. */
  constructor(private readonly logger: Logger) {}

  /** Enforce listener-level access rules, then dispatch each incoming HTTP request. */
  async handleRequest(req: IncomingMessage, res: ServerResponse, ctx: HttpContext): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname

    if (!isManagementRequestAllowed(req.socket.localAddress ?? '', path)) {
      sendJson(res, 403, { error: 'Forbidden' })
      return
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    try {
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

      if (path === '/auth/signup' || path === '/auth/login') {
        await handlePublicAccountAuth(req, res, path.endsWith('signup') ? 'signup' : 'login', ctx)
        return
      }
      if (path === '/auth/devices') {
        await handleAccountDevices(req, res, ctx)
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
      if (error instanceof ZodError) {
        this.logger.warn({ path, issues: error.issues }, 'Request validation failed')
        if (!res.headersSent) {
          sendJson(res, 400, { error: 'Validation failed', issues: error.issues })
        }
        return
      }
      if (error instanceof SyntaxError) {
        this.logger.warn({ path, error: error.message }, 'Malformed request body')
        if (!res.headersSent) {
          sendJson(res, 400, { error: 'Malformed JSON body' })
        }
        return
      }
      this.logger.error({ error, path }, 'Request failed')
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  /** Route an API request to the resource-specific handler. */
  private async handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    ctx: HttpContext,
  ): Promise<void> {
    const segments = url.pathname.split('/').filter(Boolean)
    const resource = segments[1]
    const id = segments[2]
    const action = segments[3]

    switch (resource) {
      case 'status':
        handleStatusApi(res, ctx)
        return
      case 'servers':
        return handleServersApi(req, res, id, action, ctx)
      case 'accounts':
        return handleAccountManagementApi(req, res, id, action, ctx)
      case 'share':
        return handleShareApi(req, res, ctx)
      case 'peers':
        return handlePeersApi(req, res, id, ctx)
      case 'policy':
        return handlePolicyApi(req, res, id, action, ctx)
      // /api/sessions/:deviceId — close a device's open MCP sessions.
      case 'sessions': {
        if (req.method !== 'DELETE') {
          sendJson(res, 405, { error: 'Method Not Allowed' })
          return
        }
        if (!id) {
          sendJson(res, 400, { error: 'Missing device id' })
          return
        }
        const closed = await ctx.proxyServer.closeSessionsForDevice(decodeURIComponent(id))
        sendJson(res, 200, { success: true, closed })
        return
      }
      case 'activity':
        return handleActivityApi(req, res, url, id, ctx)
      case 'health':
        return handleHealthApi(req, res, ctx)
      case 'tailscale':
        return handleTailscaleApi(req, res, url, id, ctx, this.logger)
      default:
        sendJson(res, 404, { error: 'Not Found' })
    }
  }

  /** Exchange a connecting client's address for an authenticated session result. */
  private async handleTokenExchange(
    req: IncomingMessage,
    res: ServerResponse,
    authManager: AuthManager,
  ): Promise<void> {
    try {
      const clientIp = req.socket.remoteAddress ?? ''
      const result = await authManager.authenticateConnection(clientIp)
      sendJson(res, 200, result)
    } catch (error: unknown) {
      sendJson(res, 500, { success: false, error: String(error) })
    }
  }
}
