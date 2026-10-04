import { describe, it, expect } from 'vitest'
import { resolveHealthStatus } from '../../src/backend/gateway/health.js'
import type { ServerHealth } from '../../src/backend/shared/activity.js'

const health = (status: ServerHealth['status']): ServerHealth => ({
  serverId: 'srv',
  status,
  consecutiveFailures: 1,
})

describe('resolveHealthStatus', () => {
  it('reports healthy while connected, regardless of the stored record', () => {
    expect(resolveHealthStatus(true, undefined)).toBe('healthy')
    expect(resolveHealthStatus(true, health('unhealthy'))).toBe('healthy')
  })

  it('does not report a stale healthy status for a disconnected server', () => {
    // Regression: a disconnected server used to fall back to the stored 'healthy'.
    expect(resolveHealthStatus(false, health('healthy'))).toBe('unknown')
    expect(resolveHealthStatus(false, undefined)).toBe('unknown')
  })

  it('preserves real connection failure statuses', () => {
    expect(resolveHealthStatus(false, health('unhealthy'))).toBe('unhealthy')
    expect(resolveHealthStatus(false, health('degraded'))).toBe('degraded')
  })
})
