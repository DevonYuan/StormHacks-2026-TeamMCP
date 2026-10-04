import { ipcMain } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { GatewayConfigSchema } from '../../shared/config.js'
import type { GatewayConfig } from '../../shared/config.js'
import type { GatewayStatus } from '../../shared/activity.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface LocalTailnetInfo {
  available: boolean
  state: string | null
  ip: string | null
  hostname: string | null
  dnsName: string | null
}

interface GatewayLifecycleDependencies {
  startGateway(): Promise<void>
  stopGateway(): Promise<void>
  getGatewayStatus(): GatewayStatus
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  isGatewayRunning(): boolean
  getGatewayProcess(): ChildProcess | null
  getGatewayConfig(): GatewayConfig
  setGatewayConfig(config: GatewayConfig): void
  getLocalTailnet(): Promise<LocalTailnetInfo>
}

/** Register renderer IPC handlers for gateway start, stop, status, and exposure. */
export function registerGatewayLifecycleIpcHandlers({
  startGateway,
  stopGateway,
  getGatewayStatus,
  gatewayFetch,
  isGatewayRunning,
  getGatewayProcess,
  getGatewayConfig,
  setGatewayConfig,
  getLocalTailnet,
}: GatewayLifecycleDependencies): void {
  ipcMain.handle(IPC_CHANNELS.GATEWAY_START, async () => {
    await startGateway()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STOP, async () => {
    await stopGateway()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    if (!isGatewayRunning()) return getGatewayStatus()
    try {
      return await gatewayFetch<GatewayStatus>('/api/status')
    } catch {
      return getGatewayStatus()
    }
  })

  ipcMain.handle(IPC_CHANNELS.GATEWAY_EXPOSE, async () => {
    const tailnet = await getLocalTailnet()
    if (!tailnet.available || !tailnet.ip) {
      throw new Error(
        `Tailscale is not connected (state: ${tailnet.state ?? 'unavailable'}). ` +
          'Connect Tailscale, then try again.',
      )
    }

    if (getGatewayProcess()) await stopGateway()

    const config = GatewayConfigSchema.parse({
      ...getGatewayConfig(),
      bindAddr: tailnet.ip,
    })
    setGatewayConfig(config)

    await startGateway()
    return { success: true, bindAddr: config.bindAddr, tailnet }
  })
}
