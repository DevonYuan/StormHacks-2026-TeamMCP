/**
 * Electron Preload Script - Secure IPC Bridge
 *
 * Exposes a controlled API surface to the renderer process via contextBridge.
 * All IPC communication goes through typed channels defined here.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ServerConfig,
  PolicyDocument,
  PolicyRule,
  ActivityQuery,
  ActivityStats,
  ActivityEntry,
  ServerHealth,
  GatewayStatus,
  GatewayConfig,
} from '../../backend/shared/index.js'
import type { AddPeerResult, HostStats, ShareInfo } from '../../backend/shared/types.js'

// Type-safe IPC channel definitions
type IpcChannels =
  | 'gateway:start'
  | 'gateway:stop'
  | 'gateway:status'
  | 'gateway:log'
  | 'servers:get'
  | 'servers:create'
  | 'servers:update'
  | 'servers:delete'
  | 'servers:connect'
  | 'servers:disconnect'
  | 'servers:refresh'
  | 'policy:get'
  | 'policy:update'
  | 'policy:addRule'
  | 'policy:removeRule'
  | 'activity:query'
  | 'activity:stats'
  | 'activity:prune'
  | 'health:get'
  | 'config:get'
  | 'config:update'
  | 'tailscale:status'
  | 'tailscale:whois'
  | 'event:activity'
  | 'event:serverHealth'
  | 'event:gatewayStatus'
  | 'event:toolsChanged'
  | 'protocol:url'
  | 'host:stats'
  | 'gateway:expose'
  | 'share:get'
  | 'peers:add'
  | 'peers:remove'

// Helper for typed invoke
function invoke<Args extends unknown[], Return>(channel: IpcChannels, ...args: Args): Promise<Return> {
  return ipcRenderer.invoke(channel, ...args)
}

// Helper for typed event listeners (listener receives only the payload)
function on<EventType>(channel: IpcChannels, listener: (data: EventType) => void): () => void {
  const wrapper = (_event: IpcRendererEvent, data: EventType) => listener(data)
  ipcRenderer.on(channel, wrapper)
  return () => ipcRenderer.off(channel, wrapper)
}

// Exposed API surface
const api = {
  // Gateway control
  gateway: {
    start: () => invoke('gateway:start'),
    stop: () => invoke('gateway:stop'),
    expose: () =>
      invoke<
        [],
        {
          success: boolean
          bindAddr: string
          tailnet: {
            available: boolean
            state: string | null
            ip: string | null
            hostname: string | null
            dnsName: string | null
          }
        }
      >('gateway:expose'),
    getStatus: () => invoke<[], GatewayStatus>('gateway:status'),
    onLog: (listener: (log: { timestamp: number; message: string; level?: string }) => void) =>
      on('gateway:log', listener),
  },

  // Server management
  servers: {
    getAll: () => invoke<[], ServerConfig[]>('servers:get'),
    create: (server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>) =>
      invoke<[Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>], { success: boolean; server: ServerConfig }>(
        'servers:create',
        server
      ),
    update: (id: string, updates: Partial<ServerConfig>) =>
      invoke<[string, Partial<ServerConfig>], { success: boolean }>('servers:update', id, updates),
    delete: (id: string) => invoke<[string], { success: boolean }>('servers:delete', id),
    connect: (id: string) => invoke<[string], { success: boolean }>('servers:connect', id),
    disconnect: (id: string) => invoke<[string], { success: boolean }>('servers:disconnect', id),
    refresh: (id: string) =>
      invoke<[string], { success: boolean; tools: { name: string }[] }>('servers:refresh', id),
    onToolsChanged: (listener: (serverId: string) => void) =>
      on('event:toolsChanged', listener),
  },

  // Policy management
  policy: {
    get: () => invoke<[], PolicyDocument>('policy:get'),
    update: (policy: PolicyDocument) => invoke<[PolicyDocument], { success: boolean }>('policy:update', policy),
    addRule: (rule: PolicyRule) => invoke<[PolicyRule], { success: boolean }>('policy:addRule', rule),
    removeRule: (ruleId: string) => invoke<[string], { success: boolean }>('policy:removeRule', ruleId),
  },

  // Activity log
  activity: {
    query: (query: ActivityQuery) => invoke<[ActivityQuery], ActivityEntry[]>('activity:query', query),
    getStats: () => invoke<[], ActivityStats>('activity:stats'),
    prune: (olderThanMs: number) => invoke<[number], { success: boolean; count: number }>('activity:prune', olderThanMs),
    onActivity: (listener: (entry: ActivityEntry) => void) =>
      on('event:activity', listener),
  },

  // Host machine CPU/memory
  host: {
    stats: () => invoke<[], HostStats>('host:stats'),
  },

  // Share (this gateway) + peers (other gateways)
  share: {
    get: () => invoke<[], ShareInfo>('share:get'),
  },
  peers: {
    add: (address: string, probe = false) =>
      invoke<[string, boolean], AddPeerResult>('peers:add', address, probe),
    remove: (id: string) => invoke<[string], { success: boolean }>('peers:remove', id),
  },

  // Health monitoring
  health: {
    getAll: () => invoke<[], ServerHealth[]>('health:get'),
    onHealthChange: (listener: (health: ServerHealth) => void) =>
      on('event:serverHealth', listener),
  },

  // Configuration
  config: {
    get: () => invoke<[], { gateway: GatewayConfig }>('config:get'),
    update: (updates: Partial<GatewayConfig>) => invoke<[Partial<GatewayConfig>], { success: boolean }>('config:update', updates),
    onGatewayStatus: (listener: (status: GatewayStatus) => void) =>
      on('event:gatewayStatus', listener),
  },

  // Tailscale
  tailscale: {
    getStatus: () => invoke<[], { available: boolean; ip: string | null; hostname: string | null; dnsName: string | null }>(
      'tailscale:status'
    ),
    whois: (ip: string) => invoke<[string], unknown>('tailscale:whois', ip),
  },

  // Utility
  utils: {
    openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
    onProtocolUrl: (listener: (url: string) => void) =>
      on('protocol:url', listener),
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

// Type declarations for renderer
declare global {
  interface Window {
    electronAPI: typeof api
  }
}