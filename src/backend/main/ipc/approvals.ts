import { ipcMain } from 'electron'
import type { GatewayApproval } from '../../shared/account.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface ApprovalIpcDependencies {
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  ensureGatewayRunning(): Promise<void>
}

/** Register host-local Tailscale approval operations. */
export function registerApprovalIpcHandlers({
  gatewayFetch,
  ensureGatewayRunning,
}: ApprovalIpcDependencies): void {
  ipcMain.handle(IPC_CHANNELS.APPROVALS_LIST, async () => {
    await ensureGatewayRunning()
    return gatewayFetch<GatewayApproval[]>('/api/approvals')
  })
  ipcMain.handle(IPC_CHANNELS.APPROVALS_APPROVE, async (_event, id: string) => {
    await ensureGatewayRunning()
    return gatewayFetch<GatewayApproval>(`/api/approvals/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    })
  })
  ipcMain.handle(IPC_CHANNELS.APPROVALS_REVOKE, async (_event, id: string) => {
    await ensureGatewayRunning()
    return gatewayFetch<GatewayApproval>(`/api/approvals/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    })
  })
}
