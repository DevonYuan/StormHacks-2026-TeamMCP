import { ipcMain } from 'electron'
import type { GatewayConfig } from '../../shared/config.js'
import type { ServerHealth } from '../../shared/activity.js'
import type { HostStats } from '../../shared/types.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface SystemIpcDependencies {
  hostStats(): HostStats
  gatewayFetchOr<T>(path: string, fallback: T, init?: RequestInit): Promise<T>
  getGatewayConfig(): GatewayConfig
  updateGatewaySettings(updates: Partial<GatewayConfig>): Promise<GatewayConfig>
}

/** Register host metrics, gateway health, and user configuration handlers. */
export function registerSystemIpcHandlers({
  hostStats,
  gatewayFetchOr,
  getGatewayConfig,
  updateGatewaySettings,
}: SystemIpcDependencies): void {
  ipcMain.handle(IPC_CHANNELS.HOST_STATS, hostStats)

  ipcMain.handle(IPC_CHANNELS.HEALTH_GET, async () => {
    return gatewayFetchOr<ServerHealth[]>('/api/health', [])
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return { gateway: getGatewayConfig() }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, updates: Partial<GatewayConfig>) => {
    const gateway = await updateGatewaySettings(updates)
    return { success: true, gateway }
  })
}
