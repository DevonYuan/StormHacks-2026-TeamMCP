import type { ServerConfig } from './protocol.js'

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
  /** Friendly display name from the server config; fall back to `id`. */
  name?: string
  transport: 'stdio' | 'streamable-http' | 'sse'
  command: string
  running: boolean
  tools: number
  callsPerMin: number
  /** null when the backend does not measure per-server resources. */
  cpu: number | null
  memMb: number | null
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

/** Aggregate gateway metrics derived from the activity log. */
export interface GatewayMetrics {
  /** 50th percentile upstream call duration, ms. */
  p50: number
  /** 95th percentile upstream call duration, ms. */
  p95: number
  /** Denied calls in the last 24 hours. */
  denied24h: number
  /** Successful calls since local midnight. */
  proxiedToday: number
}

/** Local tailnet info surfaced by the gateway (`/api/tailscale`). */
export interface TailscaleInfo {
  available: boolean
  ip: string | null
  hostname: string | null
  dnsName: string | null
}

/** Canonical "what to share" info for exposing this gateway (`/api/share`). */
export interface ShareInfo {
  running: boolean
  /** `host:port` peers should connect to. */
  address: string
  /** Full Streamable-HTTP endpoint peers register. */
  mcpUrl: string
  bindAddress: string
  port: number
  /** True when bound to loopback only (not reachable by peers). */
  localOnly: boolean
  /** Active MCP sessions on this gateway. */
  connectedPeers: number
  /** Number of registered upstream servers. */
  servers: number
  tailscale: TailscaleInfo
}

/** A tool discovered on a peer gateway. */
export interface PeerTool {
  name: string
  description?: string
}

/** Result of adding (or probing) a peer gateway (`POST /api/peers`). */
export interface AddPeerResult {
  success: boolean
  probe?: boolean
  url: string
  tools: PeerTool[]
  server?: ServerConfig
}
