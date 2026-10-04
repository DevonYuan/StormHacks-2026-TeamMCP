import { describe, it, expect } from 'vitest'
import { normalizePeerUrl, peerHost } from '@shared/peer'

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

describe('peerHost', () => {
  it('extracts host:port from a normalized URL', () => {
    expect(peerHost('http://100.64.12.21:8788/mcp')).toBe('100.64.12.21:8788')
  })

  it('falls back to the raw value when unparseable', () => {
    expect(peerHost('not a url')).toBe('not a url')
  })
})
