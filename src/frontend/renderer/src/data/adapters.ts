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
  Server,
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
