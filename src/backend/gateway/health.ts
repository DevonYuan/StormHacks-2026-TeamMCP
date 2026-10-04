/**
 * Health status resolution for registered MCP servers.
 */

import type { ServerHealth, ServerHealthStatus } from '../shared/activity.js'

/**
 * Resolve the health status shown for a registered server.
 *
 * A server is only `healthy` while the gateway actually holds a live connection.
 * A previously recorded success must not mask a disconnect, so a server that is
 * not connected reports `unknown` unless a real connection failure recorded a
 * `degraded`/`unhealthy` status (those are preserved).
 */
export function resolveHealthStatus(
  connected: boolean,
  existing: ServerHealth | undefined
): ServerHealthStatus {
  if (connected) return 'healthy'
  if (existing && (existing.status === 'unhealthy' || existing.status === 'degraded')) {
    return existing.status
  }
  return 'unknown'
}
