/**
 * Activity log, server health, and gateway status types.
 * Shared across gateway, main, preload, and renderer processes.
 */

import type { Identity } from './policy.js'

// A single recorded request/response in the activity log
export interface ActivityEntry {
  id: string
  timestamp: number
  identity: Identity
  method: string
  serverId: string
  toolName?: string
  requestSummary: string
  responseSummary: string
  success: boolean
  errorCode?: number
  errorMessage?: string
  durationMs: number
  requestPayload?: unknown
  responsePayload?: unknown
}

// Query parameters for filtering the activity log
export interface ActivityQuery {
  since?: number
  until?: number
  identity?: string
  deviceId?: string
  serverId?: string
  toolName?: string
  method?: string
  success?: boolean
  limit?: number
  offset?: number
  sortBy?: 'timestamp' | 'duration_ms'
  sortOrder?: 'asc' | 'desc'
}

// Aggregated statistics over the activity log
export interface ActivityStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  uniqueUsers: number
  uniqueServers: number
  avgDurationMs: number
  byMethod: Record<string, number>
  byServer: Record<string, number>
  byTool: Record<string, number>
  byIdentity: Record<string, number>
  errorsByCode: Record<string, number>
}

export type ServerHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

// Health of a single registered MCP server
export interface ServerHealth {
  serverId: string
  status: ServerHealthStatus
  lastCheck?: number
  latencyMs?: number
  error?: string
  consecutiveFailures: number
}

// Live gateway process status surfaced to the UI
export interface GatewayStatus {
  running: boolean
  startedAt?: number
  uptimeMs: number
  boundAddress: string
  port: number
  connectedPeers: number
  totalRequests: number
  activeSessions: number
}

// Real-time events pushed from main process to the renderer
export type RealtimeEvent =
  | { type: 'activity'; entry: ActivityEntry }
  | { type: 'server-health'; health: ServerHealth }
  | { type: 'gateway-status'; status: GatewayStatus }
