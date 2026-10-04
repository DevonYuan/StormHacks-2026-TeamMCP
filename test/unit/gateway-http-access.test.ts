import { describe, expect, it } from 'vitest'
import { isLoopbackAddress, isManagementRequestAllowed } from '../../src/backend/gateway/http-access.js'

describe('gateway HTTP access', () => {
  it('recognizes IPv4-mapped loopback addresses', () => {
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::ffff:192.168.1.10')).toBe(false)
  })

  it.each(['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1'])(
    'allows management requests on loopback address %s',
    (address) => {
      expect(isManagementRequestAllowed(address, '/api/servers')).toBe(true)
    }
  )

  it.each(['100.64.0.1', '192.168.1.10', '::ffff:192.168.1.10'])(
    'denies management requests on exposed address %s',
    (address) => {
      expect(isManagementRequestAllowed(address, '/api/servers')).toBe(false)
      expect(isManagementRequestAllowed(address, '/auth/token')).toBe(false)
      expect(isManagementRequestAllowed(address, '/api/accounts')).toBe(false)
      expect(isManagementRequestAllowed(address, '/policy')).toBe(false)
    }
  )

  it('keeps MCP and health endpoints available on exposed addresses', () => {
    expect(isManagementRequestAllowed('100.64.0.1', '/mcp')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/mcp/session')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/health')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/auth/signup')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/auth/login')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/auth/devices')).toBe(true)
    expect(isManagementRequestAllowed('100.64.0.1', '/api/accounts')).toBe(false)
  })
})
