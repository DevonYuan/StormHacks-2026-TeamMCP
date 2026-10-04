import { describe, it, expect } from 'vitest'
import { isPeerConfig, isPeerSessionClosed, normalizePeerUrl, peerHost } from '@shared/peer'
import { TransportType } from '@shared/protocol'

describe('normalizePeerUrl', () => {
  it('adds the default port and /mcp to a bare host', () => {
    expect(normalizePeerUrl('100.64.12.21')).toBe('http://100.64.12.21:8788/mcp')
  })

  it('keeps an explicit port', () => {
    expect(normalizePeerUrl('100.64.12.21:9000')).toBe('http://100.64.12.21:9000/mcp')
  })

  it('accepts a full URL without double-appending /mcp', () => {
    expect(normalizePeerUrl('http://host:8788/mcp')).toBe('http://host:8788/mcp')
    expect(normalizePeerUrl('https://host/mcp/')).toBe('https://host/mcp')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizePeerUrl('  host:1234  ')).toBe('http://host:1234/mcp')
  })

  it('rejects empty input', () => {
    expect(() => normalizePeerUrl('   ')).toThrow()
  })

  it('rejects malformed input', () => {
    expect(() => normalizePeerUrl('http://')).toThrow()
  })
})

describe('isPeerConfig', () => {
  it('matches a registered teammate gateway', () => {
    expect(
      isPeerConfig({
        name: 'peer:100.64.12.21:8788',
        transport: TransportType.StreamableHttp,
        description: 'Remote Team MCP Gateway peer',
      })
    ).toBe(true)
  })

  it('ignores local stdio servers', () => {
    expect(
      isPeerConfig({
        name: 'files',
        transport: TransportType.Stdio,
        description: 'Remote Team MCP Gateway peer',
      })
    ).toBe(false)
  })
})

describe('isPeerSessionClosed', () => {
  it('matches a host-closed session', () => {
    expect(isPeerSessionClosed('Maximum reconnection attempts (0) exceeded.')).toBe(true)
    expect(isPeerSessionClosed('Session not found')).toBe(true)
  })

  it('ignores a timeout', () => {
    expect(isPeerSessionClosed('Request timed out')).toBe(false)
  })
})

describe('peerHost', () => {
  it('extracts host:port from a normalized URL', () => {
    expect(peerHost('http://100.64.12.21:8788/mcp')).toBe('100.64.12.21:8788')
  })

  it('falls back to the raw value when unparseable', () => {
    expect(peerHost('not a url')).toBe('not a url')
  })
})
