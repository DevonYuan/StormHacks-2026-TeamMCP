import type { IncomingMessage, ServerResponse } from 'node:http'
import { getTailnetDevices } from '../../auth/tailscale.js'
import { toPublicGatewayAccount } from '../../../shared/account.js'
import { isLoopbackAddress } from '../../http-access.js'
import type { HttpContext } from '../context.js'
import { readJson, sendJson } from '../response.js'

/** Send expected account errors; let unexpected storage/runtime failures reach the router logger. */
function sendAccountError(res: ServerResponse, error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const status = /already exists/.test(error.message) ? 409
    : /incorrect|different Tailscale|revoked/.test(error.message) ? 403
      : /^Enter |^Use /.test(error.message) ? 400
        : /account not found/i.test(error.message) ? 404
          : undefined
  if (status === undefined) return false
  sendJson(res, status, { error: error.message })
  return true
}

/** Authenticate or register an account using the Tailscale identity of the caller. */
export async function handlePublicAccountAuth(
  req: IncomingMessage,
  res: ServerResponse,
  action: 'signup' | 'login',
  ctx: HttpContext,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }
  const clientIp = req.socket.remoteAddress ?? ''
  const identity = await ctx.authManager.resolveClientIdentity(clientIp)
  if (!identity) {
    sendJson(res, 401, { error: 'A verified Tailscale identity is required.' })
    return
  }

  const body = await readJson(req)
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    sendJson(res, 400, { error: 'Email and password are required.' })
    return
  }

  try {
    const result = action === 'signup'
      ? ctx.accountService.signUp(
          typeof body.name === 'string' ? body.name : '',
          body.email,
          body.password,
          identity,
          isLoopbackAddress(clientIp) || identity.user === 'local@dev',
        )
      : ctx.accountService.signIn(body.email, body.password, identity)
    sendJson(res, action === 'signup' ? 201 : 200, {
      account: toPublicGatewayAccount(result.account),
      status: result.status,
    })
  } catch (error) {
    if (!sendAccountError(res, error)) throw error
  }
}

/** List pending accounts for local host approval, or approve/revoke one account. */
export async function handleAccountManagementApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string | undefined,
  action: string | undefined,
  ctx: HttpContext,
): Promise<void> {
  if (!id && req.method === 'GET') {
    sendJson(res, 200, ctx.accountService.listAll().map(toPublicGatewayAccount))
    return
  }
  if (id && req.method === 'DELETE' && !action) {
    try {
      ctx.accountService.revoke(id)
      await ctx.proxyServer.revokeAccountSessions(id)
      sendJson(res, 200, { success: true })
    } catch (error) {
      if (!sendAccountError(res, error)) throw error
    }
    return
  }
  if (!id || !action) {
    sendJson(res, 404, { error: 'Not Found' })
    return
  }
  if (req.method === 'POST' && action === 'approve') {
    try {
      sendJson(res, 200, toPublicGatewayAccount(ctx.accountService.approve(id)))
    } catch (error) {
      if (!sendAccountError(res, error)) throw error
    }
    return
  }
  sendJson(res, 405, { error: 'Method Not Allowed' })
}

/** Return only the signed-in Tailscale user's devices. */
export async function handleAccountDevices(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HttpContext,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }
  const accountId = req.headers['x-tether-account-id']
  const id = Array.isArray(accountId) ? accountId[0] : accountId
  const identity = await ctx.authManager.resolveClientIdentity(req.socket.remoteAddress ?? '')
  if (!id || !identity || !ctx.accountService.authorize(id, identity)) {
    sendJson(res, 403, { error: 'Account is not authorized for this Tailscale identity.' })
    return
  }
  const devices = await getTailnetDevices(ctx.config)
  const ownDevices = devices.filter(device => device.user?.toLowerCase() === identity.user.toLowerCase())
  sendJson(res, 200, {
    available: true,
    self: ownDevices.find(device => device.self) ?? null,
    devices: ownDevices.filter(device => !device.self),
  })
}
