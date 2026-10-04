import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServerHealth } from '../../../shared/activity.js'
import type { HttpContext } from '../context.js'
import { resolveHealthStatus } from '../../health.js'
import { sendJson } from '../response.js'

/** Return status fields combined with the gateway's listener configuration. */
export function handleStatusApi(res: ServerResponse, ctx: HttpContext): void {
  const status = ctx.proxyServer.getStatus()
  sendJson(res, 200, {
    ...status,
    boundAddress: ctx.config.bindAddr,
    port: ctx.config.port,
    connectedPeers: status.activeSessions,
  })
}

/** Return the current health of each configured server. */
export function handleHealthApi(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HttpContext,
): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  const records = new Map(ctx.repos.health.getAll().map(health => [health.serverId, health]))
  const connected = new Set(ctx.clientManager.getConnectedServers().map(connection => connection.serverId))
  const health: ServerHealth[] = ctx.repos.servers.getAll().map(server => {
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

  sendJson(res, 200, health)
}
