/**
 * Peer gateway address helpers.
 *
 * A "peer" is another Team MCP Gateway reachable over the tailnet. We register
 * it as a Streamable-HTTP upstream and proxy its tools, so a teammate's exposed
 * servers appear locally.
 */

import type { ServerConfig } from './protocol.js'
import { TransportType } from './protocol.js'

const DEFAULT_PORT = 8788
const MCP_PATH = '/mcp'

/** Stored on streamable-HTTP servers that represent a teammate's gateway. */
export const PEER_DESCRIPTION = 'Remote Team MCP Gateway peer'

/** True for an upstream that is another Team MCP gateway, not a local MCP server. */
export function isPeerConfig(
  config: Pick<ServerConfig, 'transport' | 'description' | 'name'>
): boolean {
  return (
    config.transport === TransportType.StreamableHttp &&
    (config.description === PEER_DESCRIPTION || config.name.startsWith('peer:'))
  )
}

/**
 * True when an MCP client error means the remote session is gone (the host
 * closed it, or the stream ended). Transient timeouts are not included.
 */
export function isPeerSessionClosed(message: string): boolean {
  return /session not found|missing session|connection closed|sse stream disconnected|failed to reconnect|maximum reconnection attempts|failed to open sse stream/i.test(
    message
  )
}

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
