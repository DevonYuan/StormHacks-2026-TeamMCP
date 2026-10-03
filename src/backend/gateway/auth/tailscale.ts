/**
 * Tailscale identity resolution.
 * Uses `tailscale status --json` and `tailscale whois <ip>` to map connections to identities.
 */

import { spawn } from 'node:child_process'
import { GatewayConfig } from '../../shared/config.js'
import { Identity } from '../../shared/policy.js'

interface TailscaleStatus {
  Self: {
    ID: string
    PublicKey: string
    HostName: string
    DNSName: string
    TailscaleIPs: string[]
    Tags: string[]
  }
  Peer: Record<string, {
    ID: string
    PublicKey: string
    HostName: string
    DNSName: string
    TailscaleIPs: string[]
    Tags: string[]
    Online: boolean
    LastSeen: string
  }>
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

export function setTailscaleCli(path: string): void {
  tailscaleCliPath = path
}

function getTailscaleCli(config: GatewayConfig): string {
  if (tailscaleCliPath) return tailscaleCliPath
  if (config.tailscaleCli) return config.tailscaleCli
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
  const output = await runTailscale(['whois', ip], config)
  return JSON.parse(output)
}

export async function resolveIdentityFromIp(clientIp: string, config: GatewayConfig): Promise<Identity | null> {
  try {
    // First check if it's a tailnet IP (100.x.y.z)
    if (!clientIp.startsWith('100.')) {
      // Not a tailnet IP - could be LAN or localhost
      return null
    }

    const whois = await getTailscaleWhois(clientIp, config)

    return {
      user: whois.Node.UserProfile.LoginName,
      device: whois.Node.Name,
      deviceId: whois.Node.ID,
      tailnet: whois.Node.UserProfile.LoginName.split('@')[1] || 'unknown',
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

export function isTailscaleAvailable(config: GatewayConfig): Promise<boolean> {
  return runTailscale(['version'], config)
    .then(() => true)
    .catch(() => false)
}