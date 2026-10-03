export type DeviceStatus = 'online' | 'offline' | 'blocked'

export interface HostStats {
  /** Busy share of all cores since the previous sample, 0–100. */
  cpu: number
  cores: number
  memUsed: number
  memTotal: number
  /** 1-minute load average (always 0 on Windows). */
  load: number
}

export interface Host {
  name: string
  ip: string
  /** MagicDNS name on the tailnet. */
  dns: string
  port: number
  uptime: string
  sharedServers: number
}

export interface Server {
  id: string
  transport: 'stdio' | 'http'
  command: string
  running: boolean
  tools: number
  callsPerMin: number
  cpu: number
  memMb: number
}

export interface Device {
  id: string
  name: string
  user: string
  ip: string
  client: string
  status: DeviceStatus
  /** Display time of the last call or connection attempt. */
  lastSeen: string
  /** Display time the current session started. */
  since: string
  latencyMs: number
  callsToday: number
  /** Server ids this device is allowed to call. */
  servers: string[]
  /** Calls per minute, oldest first, last 30 minutes. */
  traffic: number[]
}

export interface ActivityEvent {
  id: string
  at: string
  deviceId: string
  /** Namespaced as `<server>__<tool>`. */
  tool: string
  outcome: 'allowed' | 'denied'
  ms: number
}
