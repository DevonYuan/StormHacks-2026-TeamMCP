import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ActivityQuery } from '../../../shared/activity.js'
import {
  PolicyDocumentSchema,
  PolicyRuleSchema,
  addPolicyRule,
  removePolicyRule,
} from '../../../shared/policy.js'
import type { HttpContext } from '../context.js'
import { readJson, sendJson } from '../response.js'

/** Read or update the active authorization policy. */
export async function handlePolicyApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  action: string | undefined,
  ctx: HttpContext,
): Promise<void> {
  // /api/policy/rules        POST   — append one rule
  // /api/policy/rules/:id    DELETE — remove one rule
  // Mutating a single rule server-side is atomic, unlike GET + PUT from the
  // caller (which can silently drop a concurrent change).
  if (id === 'rules') {
    if (!action && req.method === 'POST') {
      const rule = PolicyRuleSchema.parse(await readJson(req))
      const policy = addPolicyRule(ctx.repos.policy.get(), rule, 'ui')
      ctx.repos.policy.set(policy)
      ctx.policyEngine.updatePolicy(policy)
      sendJson(res, 201, { success: true, policy })
      return
    }
    if (action && req.method === 'DELETE') {
      const existing = ctx.repos.policy.get()
      if (!existing.rules.some(r => r.id === action)) {
        sendJson(res, 404, { error: `Rule not found: ${action}` })
        return
      }
      const policy = removePolicyRule(existing, action, 'ui')
      ctx.repos.policy.set(policy)
      ctx.policyEngine.updatePolicy(policy)
      sendJson(res, 200, { success: true, policy })
      return
    }
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  if (id) {
    sendJson(res, 404, { error: 'Not Found' })
    return
  }

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

/** Query, summarize, or prune the persisted activity log. */
export async function handleActivityApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  id: string | undefined,
  ctx: HttpContext,
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
