/**
 * Peer gateway address helpers.
 *
 * A "peer" is another Team MCP Gateway reachable over the tailnet. We register
 * it as a Streamable-HTTP upstream and proxy its tools, so a teammate's exposed
 * servers appear locally.
 */

const DEFAULT_PORT = 8788
const MCP_PATH = '/mcp'

/**
 * Normalize a user-entered peer address into a Streamable-HTTP MCP URL.
 * Accepts `host`, `host:port`, `http(s)://host:port`, with or without `/mcp`.
 * Throws on empty or malformed input.
 */
export function normalizePeerUrl(address: string): string {
  const raw = (address ?? '').trim()
  if (!raw) throw new Error('Peer address is required')

  const hadScheme = /^https?:\/\//i.test(raw)
  const withScheme = hadScheme
    ? raw
    : `http://${raw}${/:\d+$/.test(raw) ? '' : `:${DEFAULT_PORT}`}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Peer address is invalid')
  }
  if (!url.hostname) throw new Error('Peer address is invalid')

  // Normalize the path to a single `/mcp` endpoint.
  let path = url.pathname.replace(/\/+$/, '')
  if (path === '') path = MCP_PATH
  else if (!/\/mcp$/i.test(path)) path = `${path}${MCP_PATH}`
  url.pathname = path

  return url.toString()
}

/** Extract `host:port` from a normalized peer URL (falls back to the raw value). */
export function peerHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Compare peer addresses without letting path differences change the gateway identity. */
export function isSamePeerGateway(address: string, authenticatedAddress: string): boolean {
  try {
    return new URL(normalizePeerUrl(address)).origin ===
      new URL(normalizePeerUrl(authenticatedAddress)).origin
  } catch {
    return false
  }
}

/** Accept only Tailscale CGNAT addresses or MagicDNS names for account auth. */
export function isTailscaleAddress(address: string): boolean {
  let url: URL
  try {
    url = new URL(normalizePeerUrl(address))
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (host.endsWith('.ts.net')) return true
  const octets = host.split('.').map(Number)
  return octets.length === 4 &&
    octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}
