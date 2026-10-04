import type { IncomingMessage, ServerResponse } from 'node:http'
import { ServerConfigSchema } from '../../../shared/protocol.js'
import type { HttpContext } from '../context.js'
import { readJson, sendJson } from '../response.js'

/** Handle listing, creating, updating, deleting, and controlling MCP servers. */
export async function handleServersApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  action: string | undefined,
  ctx: HttpContext,
): Promise<void> {
  const { repos, clientManager } = ctx

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
          repos.health.recordFailure(created.id, error instanceof Error ? error.message : String(error))
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
          repos.health.recordFailure(updated.id, error instanceof Error ? error.message : String(error))
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
