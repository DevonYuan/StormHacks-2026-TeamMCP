import { ipcMain } from 'electron'
import { isAccountAuthResult } from '../../shared/account.js'
import type { AccountAuthResult, PublicGatewayAccount } from '../../shared/account.js'
import { isTailscaleAddress, normalizePeerUrl } from '../../shared/peer.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface AccountIpcDependencies {
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  ensureGatewayRunning(): Promise<void>
}

/** Register account operations while keeping database access in the gateway. */
export function registerAccountIpcHandlers({
  gatewayFetch,
  ensureGatewayRunning,
}: AccountIpcDependencies): void {
  const authenticate = async (
    mode: 'signup' | 'login',
    address: string,
    body: Record<string, string>,
  ): Promise<AccountAuthResult> => {
    if (!address.trim()) {
      await ensureGatewayRunning()
      return gatewayFetch<AccountAuthResult>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    }
    if (!isTailscaleAddress(address)) {
      throw new Error('Account registration requires a Tailscale IP or MagicDNS address.')
    }
    const endpoint = new URL(normalizePeerUrl(address))
    endpoint.pathname = `/auth/${mode}`
    endpoint.search = ''
    endpoint.hash = ''

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    const result: unknown = await response.json()
    if (!response.ok) {
      const message = result && typeof result === 'object' && 'error' in result &&
        typeof result.error === 'string'
        ? result.error
        : `Gateway rejected account request (${response.status}).`
      throw new Error(message)
    }
    if (!isAccountAuthResult(result)) {
      throw new Error('Gateway returned an invalid account response.')
    }
    return result
  }

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_SIGNUP,
    (_event, address: string, name: string, email: string, password: string) =>
      authenticate('signup', address, { name, email, password }),
  )
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_LOGIN,
    (_event, address: string, email: string, password: string) =>
      authenticate('login', address, { email, password }),
  )
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_LIST, async () => {
    await ensureGatewayRunning()
    return gatewayFetch<PublicGatewayAccount[]>('/api/accounts')
  })
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_APPROVE, async (_event, id: string) => {
    await ensureGatewayRunning()
    return gatewayFetch<PublicGatewayAccount>(`/api/accounts/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    })
  })
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_REVOKE, async (_event, id: string) => {
    await ensureGatewayRunning()
    return gatewayFetch<{ success: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  })
}
