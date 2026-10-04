/**
 * Tailscale identity resolution.
 * Uses `tailscale status --json` and `tailscale whois <ip>` to map connections to identities.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { GatewayConfig } from '../../shared/config.js'
import { Identity } from '../../shared/policy.js'
import type { TailnetDevice } from '../../shared/types.js'

interface TailscaleUser {
  ID: number
  LoginName: string
  DisplayName: string
  ProfilePicURL?: string
}

interface TailscaleNodeInfo {
  ID: string
  StableID?: string
  UserID?: number
  PublicKey?: string
  HostName: string
  DNSName: string
  TailscaleIPs: string[]
  Tags?: string[]
  Online?: boolean
  LastSeen?: string
  OS?: string
}

interface TailscaleStatus {
  BackendState?: string
  MagicDNSSuffix?: string
  Self: TailscaleNodeInfo
  Peer?: Record<string, TailscaleNodeInfo>
  User?: Record<string, TailscaleUser>
}

interface TailscaleWhois {
  Node: {
    ID: string
    Name: string
    User: string
    UserProfile: {
      ID: string
      LoginName: string
      DisplayName: string
      ProfilePicURL: string
    }
  }
  Capabilities: string[]
}

let tailscaleCliPath: string | null = null

// The Tailscale GUI apps do not add their CLI to PATH, so probe the usual install
// locations. Try the standalone CLI / wrapper first — the macOS GUI bundle binary
// can print "The Tailscale GUI failed to start…" on stdout and still exit 0 when
// spawned from a GUI-less environment.
const TAILSCALE_CLI_CANDIDATES = [
  'tailscale',
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
]

export function setTailscaleCli(path: string): void {
  tailscaleCliPath = path
}

function cliCandidates(config: GatewayConfig): string[] {
  return [
    ...(tailscaleCliPath ? [tailscaleCliPath] : []),
    ...(config.tailscaleCli ? [config.tailscaleCli] : []),
    ...TAILSCALE_CLI_CANDIDATES,
  ]
}

function runTailscaleCli(cli: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => stdout += d.toString())
    proc.stderr.on('data', d => stderr += d.toString())
    proc.on('close', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`tailscale ${args.join(' ')} failed (code ${code}): ${stderr}`))
    })
    proc.on('error', err => reject(new Error(`Failed to spawn tailscale: ${err.message}`)))
  })
}

/**
 * Run a `tailscale … --json` command, trying each CLI location until one returns
 * parseable JSON. A candidate that exits 0 without JSON output (e.g. the macOS
 * GUI bundle binary) is skipped rather than treated as success.
 */
/** Reject output that isn't JSON, so a `--json` command falls through to the next CLI. */
function ensureJson(output: string): void {
  JSON.parse(output)
}

/**
 * Run `tailscale …`, trying each CLI location until one succeeds. `validate`
 * rejects a candidate whose output is unusable (e.g. a `--json` command that
 * exited 0 with a startup message on stdout) so the next location is tried.
 */
async function runTailscale(
  args: string[],
  config: GatewayConfig,
  validate: (output: string) => void = () => {},
): Promise<string> {
  let lastError: unknown = new Error('No usable Tailscale CLI found')
  for (const cli of cliCandidates(config)) {
    // Skip absolute paths that don't exist; bare names resolve via PATH.
    if ((cli.includes('/') || cli.includes('\\')) && !existsSync(cli)) continue
    try {
      const output = await runTailscaleCli(cli, args)
      validate(output)
      tailscaleCliPath = cli
      return output
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function getTailscaleStatus(config: GatewayConfig): Promise<TailscaleStatus> {
  const output = await runTailscale(['status', '--json'], config, ensureJson)
  return JSON.parse(output)
}

export async function getTailscaleWhois(ip: string, config: GatewayConfig): Promise<TailscaleWhois> {
  // `whois` is human-readable by default; `--json` is required to parse it.
  const output = await runTailscale(['whois', '--json', ip], config, ensureJson)
  return JSON.parse(output)
}

export async function resolveIdentityFromIp(clientIp: string, config: GatewayConfig): Promise<Identity | null> {
  const normalizedIp = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp
  try {
    // First check if it's a tailnet IP (100.x.y.z)
    if (!normalizedIp.startsWith('100.')) {
      // Not a tailnet IP - could be LAN or localhost
      return null
    }

    try {
      const whois = await getTailscaleWhois(normalizedIp, config)
      const loginName = whois.Node?.UserProfile?.LoginName
      if (loginName) {
        let magicDnsSuffix: string | undefined
        try {
          magicDnsSuffix = (await getTailscaleStatus(config)).MagicDNSSuffix
        } catch {
          // Whois already verified the peer; the login domain is a fallback tailnet label.
        }
        return {
          user: loginName,
          device: (whois.Node.Name || '').replace(/\.$/, ''),
          deviceId: String(whois.Node.ID ?? ''),
          tailnet: magicDnsSuffix || loginName.split('@')[1] || 'unknown',
        }
      }
    } catch {
      // Fall back to the local status snapshot for CLI versions with different whois output.
    }

    const status = await getTailscaleStatus(config)
    const nodes: TailscaleNodeInfo[] = [status.Self, ...Object.values(status.Peer ?? {})]
    const node = nodes.find(n => (n.TailscaleIPs ?? []).includes(normalizedIp))
    if (!node) return null

    const user = node.UserID != null ? status.User?.[String(node.UserID)] : undefined
    const loginName = user?.LoginName
    if (!loginName) return null

    return {
      user: loginName,
      device: (node.DNSName || node.HostName || '').replace(/\.$/, ''),
      deviceId: String(node.ID ?? node.StableID ?? ''),
      tailnet: status.MagicDNSSuffix || loginName.split('@')[1] || 'unknown',
    }
  } catch (error) {
    console.warn('Failed to resolve Tailscale peer identity:', error)
    return null
  }
}

export async function getLocalTailnetInfo(config: GatewayConfig): Promise<{ ip: string; hostname: string; dnsName: string } | null> {
  try {
    const status = await getTailscaleStatus(config)
    const ips = status.Self.TailscaleIPs
    if (ips.length === 0) return null

    return {
      ip: ips[0],
      hostname: status.Self.HostName,
      dnsName: status.Self.DNSName,
    }
  } catch {
    return null
  }
}

export async function getLocalTailscaleIdentity(config: GatewayConfig): Promise<Identity | null> {
  try {
    const status = await getTailscaleStatus(config)
    const node = status.Self
    const user = node.UserID != null ? status.User?.[String(node.UserID)] : undefined
    if (!user?.LoginName) return null
    return {
      user: user.LoginName,
      device: (node.DNSName || node.HostName || '').replace(/\.$/, ''),
      deviceId: String(node.ID ?? node.StableID ?? ''),
      tailnet: status.MagicDNSSuffix || user.LoginName.split('@')[1] || 'unknown',
    }
  } catch {
    return null
  }
}

/**
 * Enumerate this machine plus every peer from `tailscale status --json`.
 * The local machine (`Self`) is returned first with `self: true`.
 */
export async function getTailnetDevices(config: GatewayConfig): Promise<TailnetDevice[]> {
  const status = await getTailscaleStatus(config)

  const userOf = (node: TailscaleNodeInfo): string | null => {
    if (node.UserID == null) return null
    return status.User?.[String(node.UserID)]?.LoginName ?? null
  }

  const toDevice = (node: TailscaleNodeInfo, self: boolean): TailnetDevice => ({
    id: String(node.ID ?? node.StableID ?? node.HostName ?? ''),
    stableId: node.StableID ?? null,
    hostname: node.HostName || (node.DNSName ?? '').replace(/\.$/, '') || 'unknown',
    dnsName: node.DNSName ?? '',
    ips: node.TailscaleIPs ?? [],
    online: self ? true : Boolean(node.Online),
    lastSeen: node.LastSeen ?? null,
    os: node.OS ?? null,
    tags: node.Tags ?? [],
    user: userOf(node),
    self,
  })

  const peers = Object.values(status.Peer ?? {}).map(node => toDevice(node, false))
  return [toDevice(status.Self, true), ...peers]
}

export function isTailscaleAvailable(config: GatewayConfig): Promise<boolean> {
  return runTailscale(['version'], config)
    .then(() => true)
    .catch(() => false)
}