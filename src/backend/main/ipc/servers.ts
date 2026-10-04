import { ipcMain } from 'electron'
import type { ServerConfig } from '../../shared/protocol.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface ServerIpcDependencies {
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  gatewayFetchOr<T>(path: string, fallback: T, init?: RequestInit): Promise<T>
  ensureGatewayRunning(): Promise<void>
}

/** Register renderer IPC handlers that proxy server operations to the gateway API. */
export function registerServerIpcHandlers({
  gatewayFetch,
  gatewayFetchOr,
  ensureGatewayRunning,
}: ServerIpcDependencies): void {
  ipcMain.handle(IPC_CHANNELS.SERVERS_GET, async () => {
    return gatewayFetchOr<ServerConfig[]>('/api/servers', [])
  })

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_CREATE,
    async (_event, server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      await ensureGatewayRunning()
      const created = await gatewayFetch<ServerConfig>('/api/servers', {
        method: 'POST',
        body: JSON.stringify(server),
      })
      return { success: true, server: created }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_UPDATE,
    async (_event, id: string, updates: Partial<ServerConfig>) => {
      const updated = await gatewayFetch<ServerConfig>(`/api/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      return { success: true, server: updated }
    },
  )

  ipcMain.handle(IPC_CHANNELS.SERVERS_DELETE, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}`, {
      method: 'DELETE',
    })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_CONNECT, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/connect`, {
      method: 'POST',
    })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_DISCONNECT, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/disconnect`, {
      method: 'POST',
    })
  })

  ipcMain.handle(IPC_CHANNELS.SERVERS_REFRESH, async (_event, id: string) => {
    return gatewayFetch<{ success: boolean }>(`/api/servers/${id}/refresh`, {
      method: 'POST',
    })
  })
}
