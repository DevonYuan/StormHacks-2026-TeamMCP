import { ipcMain } from 'electron'
import type { AddPeerResult, ShareInfo, TailnetDevicesResponse } from '../../shared/types.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface NetworkIpcDependencies {
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  ensureGatewayRunning(): Promise<void>
  isGatewayRunning(): boolean
}

/** Register Tailscale, sharing, and remote-peer IPC handlers. */
export function registerNetworkIpcHandlers({
  gatewayFetch,
  ensureGatewayRunning,
  isGatewayRunning,
}: NetworkIpcDependencies): void {
  ipcMain.handle(IPC_CHANNELS.TAILSCALE_STATUS, async () => {
    if (!isGatewayRunning()) {
      return { available: false, ip: null, hostname: null, dnsName: null }
    }
    return gatewayFetch<{
      available: boolean
      ip: string | null
      hostname: string | null
      dnsName: string | null
    }>('/api/tailscale')
  })

  ipcMain.handle(IPC_CHANNELS.TAILSCALE_WHOIS, async (_event, ip: string) => {
    return gatewayFetch(`/api/tailscale/whois?ip=${encodeURIComponent(ip)}`)
  })

  ipcMain.handle(IPC_CHANNELS.TAILSCALE_DEVICES, async () => {
    if (!isGatewayRunning()) {
      return { available: false, self: null, devices: [] }
    }
    return gatewayFetch<TailnetDevicesResponse>('/api/tailscale/devices')
  })

  ipcMain.handle(IPC_CHANNELS.SHARE_GET, async () => {
    return gatewayFetch<ShareInfo>('/api/share')
  })

  ipcMain.handle(IPC_CHANNELS.PEERS_ADD, async (_event, address: string, probe?: boolean) => {
    await ensureGatewayRunning()
    return gatewayFetch<AddPeerResult>('/api/peers', {
      method: 'POST',
      body: JSON.stringify({ address, probe: probe === true }),
    })
  })

  ipcMain.handle(IPC_CHANNELS.PEERS_REMOVE, async (_event, id: string) => {
    await ensureGatewayRunning()
    return gatewayFetch<{ success: boolean }>(`/api/peers/${id}`, {
      method: 'DELETE',
    })
  })
}
