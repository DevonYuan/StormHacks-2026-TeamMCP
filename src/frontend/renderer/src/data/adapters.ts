/**
 * Pure adapters that map real gateway data onto the Network page's view types.
 * Kept free of React/Electron so the mapping logic can be unit tested directly.
 */

import type { ActivityEntry, GatewayStatus, ServerHealth } from '@shared/activity'
import type { PolicyDocument, Identity } from '@shared/policy'
import type { ServerConfig } from '@shared/protocol'
import type {
  ActivityEvent,
  Device,
  GatewayMetrics,
  Host,
  Machine,
  MachineStatus,
  Server,
  TailnetDevice,
  TailnetDevicesResponse,
  TailscaleInfo,
} from '@shared/types'

/** A device is "online" if it made a call within this window (Phase 1 heuristic). */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000
export const TRAFFIC_BUCKETS = 30
export const BUCKET_MS = 60 * 1000

function two(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

function formatSeen(ts: number, now: number): string {
  const d = new Date(ts)
  const sameDay = new Date(now).toDateString() === d.toDateString()
  if (sameDay) return `${two(d.getHours())}:${two(d.getMinutes())}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${total}s`
}

/** Stable identity key for grouping activity entries into devices. */
export function identityKey(identity: Identity): string {
  return identity.deviceId || identity.device || identity.user || 'unknown'
}

function startOfToday(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function toActivityEvents(entries: ActivityEntry[]): ActivityEvent[] {
  return entries.map((e) => ({
    id: e.id,
    at: formatClock(e.timestamp),
    deviceId: identityKey(e.identity),
    tool: e.toolName ? `${e.serverId}__${e.toolName}` : e.serverId,
    outcome: e.success ? 'allowed' : 'denied',
    ms: e.durationMs,
  }))
}

export function countCallsPerMinute(entries: ActivityEntry[], now = Date.now()): number {
  return entries.filter((e) => now - e.timestamp <= BUCKET_MS).length
}

export function toGatewayMetrics(entries: ActivityEntry[], now = Date.now()): GatewayMetrics {
  const durations = entries.map((e) => e.durationMs)
  const midnight = startOfToday(now)
  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    denied24h: entries.filter((e) => !e.success && now - e.timestamp <= 24 * 3600 * 1000).length,
    proxiedToday: entries.filter((e) => e.success && e.timestamp >= midnight).length,
  }
}

export function toServers(
  configs: ServerConfig[],
  health: ServerHealth[],
  entries: ActivityEntry[],
  now = Date.now()
): Server[] {
  const healthByServer = new Map(health.map((h) => [h.serverId, h]))
  return configs.map((c) => {
    const h = healthByServer.get(c.id)
    const own = entries.filter((e) => e.serverId === c.id)
    const tools = new Set(own.map((e) => e.toolName).filter((t): t is string => Boolean(t))).size
    return {
      id: c.id,
      name: c.name,
      transport: c.transport as Server['transport'],
      command: c.url ?? [c.command, ...(c.args ?? [])].filter(Boolean).join(' '),
      running: h?.status === 'healthy',
      tools,
      callsPerMin: own.filter((e) => now - e.timestamp <= BUCKET_MS).length,
      cpu: null,
      memMb: null,
    }
  })
}

function identityMatches(matchers: Identity[] | undefined, actual: Identity): boolean {
  if (!matchers || matchers.length === 0) return true
  return matchers.some(
    (m) =>
      (!m.user || m.user === actual.user) &&
      (!m.device || m.device === actual.device) &&
      (!m.deviceId || m.deviceId === actual.deviceId) &&
      (!m.tailnet || m.tailnet === actual.tailnet)
  )
}

/** Servers an identity may call, from the first matching rule (highest priority first). */
export function accessibleServers(
  policy: PolicyDocument,
  identity: Identity,
  allServerIds: string[]
): string[] {
  const rules = [...policy.rules].sort((a, b) => b.priority - a.priority)
  for (const rule of rules) {
    if (!identityMatches(rule.identities, identity)) continue
    if (rule.effect === 'deny') return []
    return rule.servers && rule.servers.length
      ? rule.servers.filter((s) => allServerIds.includes(s))
      : allServerIds
  }
  return policy.defaultEffect === 'allow' ? allServerIds : []
}

function trafficBuckets(entries: ActivityEntry[], now: number): number[] {
  const buckets = new Array<number>(TRAFFIC_BUCKETS).fill(0)
  for (const e of entries) {
    const age = now - e.timestamp
    if (age < 0 || age >= TRAFFIC_BUCKETS * BUCKET_MS) continue
    const idx = TRAFFIC_BUCKETS - 1 - Math.floor(age / BUCKET_MS)
    buckets[idx] += 1
  }
  return buckets
}

export function toDevices(
  entries: ActivityEntry[],
  policy: PolicyDocument,
  allServerIds: string[],
  now = Date.now()
): Device[] {
  const byKey = new Map<string, ActivityEntry[]>()
  for (const e of entries) {
    const key = identityKey(e.identity)
    const list = byKey.get(key)
    if (list) list.push(e)
    else byKey.set(key, [e])
  }

  const midnight = startOfToday(now)
  const devices: Device[] = []
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.timestamp - b.timestamp)
    const last = list[list.length - 1]
    const identity = last.identity
    const allowed = accessibleServers(policy, identity, allServerIds)
    const blocked = allServerIds.length > 0 && allowed.length === 0
    const online = !blocked && now - last.timestamp <= ONLINE_WINDOW_MS
    const latency = Math.round(list.reduce((sum, e) => sum + e.durationMs, 0) / list.length)

    devices.push({
      id: key,
      name: identity.device || identity.user || key,
      user: identity.user || '—',
      ip: '—',
      client: '—',
      status: blocked ? 'blocked' : online ? 'online' : 'offline',
      lastSeen: formatSeen(last.timestamp, now),
      since: '—',
      latencyMs: latency,
      callsToday: list.filter((e) => e.timestamp >= midnight).length,
      servers: allowed,
      traffic: trafficBuckets(list, now),
    })
  }

  devices.sort(
    (a, b) =>
      Number(b.status === 'online') - Number(a.status === 'online') || a.name.localeCompare(b.name)
  )
  return devices
}

/** The loopback identity the gateway assigns to local development calls. */
const LOCAL_USER = 'local@dev'
const LOCAL_DEVICE_IDS = new Set(['local-dev-device'])

const MACHINE_STATUS_RANK: Record<MachineStatus, number> = {
  connected: 0,
  denied: 1,
  offline: 2,
}

/** Build a policy identity from a tailnet node so we can resolve its access. */
function tailnetIdentity(node: TailnetDevice): Identity {
  return {
    user: node.user ?? '',
    device: node.dnsName.replace(/\.$/, '') || node.hostname,
    deviceId: node.id,
    tailnet: node.user?.split('@')[1] ?? '',
  }
}

/** Tailscale reports a zero time (year 1) for online peers — treat that as unknown. */
function parseLastSeen(value: string | null): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) && ts > 0 ? ts : 0
}

function machineStatus(
  identity: Identity,
  entry: ActivityEntry | undefined,
  online: boolean,
  policy: PolicyDocument,
  allServerIds: string[],
  now: number
): MachineStatus {
  if (entry?.errorCode === 403) return 'denied'
  const allowed = accessibleServers(policy, identity, allServerIds)
  if (allServerIds.length > 0 && allowed.length === 0) return 'denied'
  if (online) return 'connected'
  if (entry && now - entry.timestamp <= ONLINE_WINDOW_MS) return 'connected'
  return 'offline'
}

/**
 * Merge the tailnet node list with gateway activity into the Machines view model.
 * Tailnet nodes supply name / IP / online; activity supplies policy status + recency.
 * Identities that only appear in the activity log are still listed (with `—` IP).
 */
export function toMachines(
  tailnet: TailnetDevicesResponse,
  status: GatewayStatus | null,
  entries: ActivityEntry[],
  policy: PolicyDocument,
  allServerIds: string[],
  now = Date.now()
): Machine[] {
  const latest = new Map<string, ActivityEntry>()
  for (const entry of entries) {
    const key = identityKey(entry.identity)
    const prev = latest.get(key)
    if (!prev || entry.timestamp > prev.timestamp) latest.set(key, entry)
  }

  const machines: Machine[] = []
  const claimed = new Set<string>()

  const nodes = [...(tailnet.self ? [tailnet.self] : []), ...tailnet.devices]
  for (const node of nodes) {
    const identity = tailnetIdentity(node)
    const host = node.dnsName.replace(/\.$/, '')
    const entry = latest.get(node.id) ?? latest.get(host) ?? latest.get(node.hostname)
    for (const key of [identityKey(identity), node.id, host, node.hostname]) {
      if (key) claimed.add(key)
    }

    const online = node.self ? Boolean(status?.running) : node.online
    const gatewayId =
      node.self && status ? `${status.boundAddress}:${status.port}` : node.stableId ?? node.id ?? ''
    const tailnetName = node.user?.split('@')[1]

    machines.push({
      id: `tailnet:${node.id}`,
      name: node.hostname,
      subtitle: [node.user, tailnetName].filter(Boolean).join(' · ') || 'Peer',
      ip: node.ips[0] ?? (node.self ? status?.boundAddress ?? '—' : '—'),
      gatewayId: gatewayId || '—',
      status: machineStatus(identity, entry, online, policy, allServerIds, now),
      badge: node.self ? 'Local' : node.tags[0] ?? 'Peer',
      lastSeenMs: entry?.timestamp ?? parseLastSeen(node.lastSeen),
    })
  }

  // A gateway with no tailnet Self (Tailscale down) still lists the local host.
  if (!tailnet.self && status?.running) {
    machines.push({
      id: 'local-gateway',
      name: 'This machine',
      subtitle: `${status.boundAddress}:${status.port}`,
      ip: status.boundAddress,
      gatewayId: `${status.boundAddress}:${status.port}`,
      status: 'connected',
      badge: 'Local',
      lastSeenMs: 0,
    })
  }

  // Identities seen only in the activity log (no matching tailnet node).
  const selfHostname = tailnet.self?.hostname
  for (const [key, entry] of latest) {
    if (claimed.has(key)) continue
    const identity = entry.identity
    const isLocal = LOCAL_DEVICE_IDS.has(identity.deviceId) || identity.user === LOCAL_USER
    if (tailnet.self && isLocal) continue
    const name = identity.device || identity.user || 'Unknown device'
    if (selfHostname && name === selfHostname) continue

    machines.push({
      id: `activity:${key}`,
      name,
      subtitle: [identity.user, identity.tailnet].filter(Boolean).join(' · ') || 'Peer',
      ip: '—',
      gatewayId: identity.deviceId || '—',
      status: machineStatus(identity, entry, false, policy, allServerIds, now),
      badge: isLocal ? 'Local' : 'Peer',
      lastSeenMs: entry.timestamp,
    })
  }

  machines.sort(
    (a, b) =>
      MACHINE_STATUS_RANK[a.status] - MACHINE_STATUS_RANK[b.status] ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
  )
  return machines
}

export function toHost(
  tailscale: TailscaleInfo,
  status: GatewayStatus | null,
  serverCount: number,
  fallbackName = 'This machine'
): Host {
  const address = status?.boundAddress ?? '127.0.0.1'
  return {
    name: tailscale.hostname || fallbackName,
    ip: tailscale.ip || address,
    dns: tailscale.dnsName || `${address}:${status?.port ?? 8788}`,
    port: status?.port ?? 8788,
    uptime: formatUptime(status?.uptimeMs ?? 0),
    sharedServers: serverCount,
  }
}
