import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HttpContext } from '../context.js'
import { sendJson } from '../response.js'

/** List host-local Tailscale access requests or change one approval decision. */
export async function handleApprovalsApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  action: string | undefined,
  ctx: HttpContext,
): Promise<void> {
  if (!id && req.method === 'GET') {
    sendJson(res, 200, ctx.approvalService.listAll())
    return
  }
  if (!id || !action || req.method !== 'POST') {
    sendJson(res, id ? 405 : 404, { error: id ? 'Method Not Allowed' : 'Not Found' })
    return
  }
  try {
    if (action === 'approve') {
      sendJson(res, 200, ctx.approvalService.approve(id))
      return
    }
    if (action === 'revoke') {
      const approval = ctx.approvalService.revoke(id)
      await ctx.proxyServer.revokeApprovalSessions(id)
      sendJson(res, 200, approval)
      return
    }
    sendJson(res, 404, { error: 'Not Found' })
  } catch (error) {
    if (!(error instanceof Error) || !/not found/i.test(error.message)) throw error
    sendJson(res, 404, { error: error.message })
  }
}
