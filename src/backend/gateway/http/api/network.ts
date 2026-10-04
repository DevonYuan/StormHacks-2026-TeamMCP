import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'
import type { ShareInfo } from '../../../shared/types.js'
import { normalizePeerUrl, peerHost } from '../../../shared/peer.js'
import { TransportType } from '../../../shared/protocol.js'
import { getTailnetDevices, getTailscaleWhois } from '../../auth/tailscale.js'
import type { HttpContext } from '../context.js'
import { readJson, sendJson } from '../response.js'

/** True when a Team MCP gateway answers `/health` at `ip:port`. */
async function probeGateway(ip: string, port: number): Promise<boolean> {
  try {
    const host = ip.includes(':') ? `[${ip}]` : ip
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok && ((await res.json()) as { status?: string }).status === 'ok'
  } catch {
    return false
  }
}

/** Resolve local Tailscale state, device listings, or a node by IP. */
export async function handleTailscaleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  id: string | undefined,
  ctx: HttpContext,
  logger: Logger,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  if (id === 'devices') {
    if (!ctx.authManager.isTailscaleReady()) {
      sendJson(res, 200, { available: false, self: null, devices: [] })
      return
    }
    try {
      const nodes = await getTailnetDevices(ctx.config)
      const sessions = ctx.proxyServer.sessionsByDevice()
      // ponytail: probes every online peer on each poll, assuming they use our port;
      // cache results if the tailnet grows past a handful of machines.
      const devices = await Promise.all(
        nodes
          .filter(node => !node.self)
          .map(async node => ({
            ...node,
            sessions: sessions.get(node.id) ?? 0,
            gatewayUp:
              node.online && node.ips[0] ? await probeGateway(node.ips[0], ctx.config.port) : false,
          })),
      )
      sendJson(res, 200, {
        available: true,
        self: nodes.find(node => node.self) ?? null,
        devices,
      })
    } catch (error) {
      logger.warn({ error }, 'Failed to enumerate tailnet devices')
      sendJson(res, 200, { available: false, self: null, devices: [] })
    }
    return
  }

  if (id === 'whois') {
    const ip = url.searchParams.get('ip')
    if (!ip) {
      sendJson(res, 400, { error: 'Missing ip query parameter' })
      return
    }
    try {
      sendJson(res, 200, await getTailscaleWhois(ip, ctx.config))
    } catch (error) {
      sendJson(res, 502, {
        error: `whois failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    return
  }

  const available = ctx.authManager.isTailscaleReady()
  const info = available ? await ctx.authManager.getLocalInfo() : null
  sendJson(res, 200, {
    available,
    ip: info?.ip ?? null,
    hostname: info?.hostname ?? null,
    dnsName: info?.dnsName ?? null,
  })
}

/** Return address and tailnet details that teammates can use to connect. */
export async function handleShareApi(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HttpContext,
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

/** Register, probe, or remove a remote gateway peer. */
export async function handlePeersApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  ctx: HttpContext,
): Promise<void> {
  const { repos, clientManager } = ctx
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

    const tools = (clientManager.getConnection(created.id)?.tools ?? []).map(tool => ({
      name: tool.name,
      description: tool.description,
    }))

    if (probe) {
      await clientManager.disconnect(created.id)
      repos.servers.delete(created.id)
      sendJson(res, 200, { success: true, probe: true, url, tools })
      return
    }

    sendJson(res, 201, { success: true, url, tools, server: created })
    return
  }

  if (req.method !== 'DELETE') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }
  await clientManager.disconnect(id)
  const ok = repos.servers.delete(id)
  sendJson(res, 200, { success: ok })
}
