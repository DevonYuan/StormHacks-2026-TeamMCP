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

// The Tailscale macOS/Windows GUI apps do not add their CLI to PATH, so probe the
// usual install locations before falling back to a bare `tailscale` lookup.
const TAILSCALE_CLI_CANDIDATES = [
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
]

export function setTailscaleCli(path: string): void {
  tailscaleCliPath = path
}

function getTailscaleCli(config: GatewayConfig): string {
  if (tailscaleCliPath) return tailscaleCliPath
  if (config.tailscaleCli) return config.tailscaleCli
  for (const candidate of TAILSCALE_CLI_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return 'tailscale'
}

function runTailscale(args: string[], config: GatewayConfig): Promise<string> {
  const cli = getTailscaleCli(config)
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

export async function getTailscaleStatus(config: GatewayConfig): Promise<TailscaleStatus> {
  const output = await runTailscale(['status', '--json'], config)
  return JSON.parse(output)
}

export async function getTailscaleWhois(ip: string, config: GatewayConfig): Promise<TailscaleWhois> {
  // `whois` is human-readable by default; `--json` is required to parse it.
  const output = await runTailscale(['whois', '--json', ip], config)
  return JSON.parse(output)
}

export async function resolveIdentityFromIp(clientIp: string, config: GatewayConfig): Promise<Identity | null> {
  try {
    // First check if it's a tailnet IP (100.x.y.z)
    if (!clientIp.startsWith('100.')) {
      // Not a tailnet IP - could be LAN or localhost
      return null
    }

    // `tailscale whois --json` does not include a UserProfile, so resolve the
    // identity from `tailscale status --json`: find the node owning the IP, then
    // map its UserID through the top-level User map for the login name.
    const status = await getTailscaleStatus(config)
    const nodes: TailscaleNodeInfo[] = [status.Self, ...Object.values(status.Peer ?? {})]
    const node = nodes.find(n => (n.TailscaleIPs ?? []).includes(clientIp))
    if (!node) return null

    const user = node.UserID != null ? status.User?.[String(node.UserID)] : undefined
    const loginName = user?.LoginName
    if (!loginName) return null

    return {
      user: loginName,
      device: (node.DNSName || node.HostName || '').replace(/\.$/, ''),
      deviceId: String(node.ID ?? node.StableID ?? ''),
      tailnet: loginName.split('@')[1] || status.MagicDNSSuffix || 'unknown',
    }
  } catch (error) {
    console.warn(`Failed to resolve identity for ${clientIp}:`, error)
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