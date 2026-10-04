import type { ActivityEvent, Device, Host, Server } from '@shared/types'

// ponytail: static mock data, replace with tRPC queries once the gateway exposes them.

const wave = (base: number, amp: number, phase: number): number[] =>
  Array.from({ length: 30 }, (_, i) =>
    Math.max(0, Math.round(base + amp * Math.sin(i / 3 + phase) + ((i * 7 + phase * 11) % 5) - 2))
  )

export const host: Host = {
  name: "Devon's MacBook",
  ip: '100.64.12.8',
  dns: 'devon-macbook.tail4e2a.ts.net',
  port: 8788,
  uptime: '2h 14m',
  sharedServers: 3
}

export const gateway = { p50: 84, p95: 212, denied24h: 7, proxiedToday: '18.4 MB' }

export const servers: Server[] = [
  {
    id: 'filesystem',
    transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-filesystem ~/scratch',
    running: true,
    tools: 11,
    callsPerMin: 9,
    cpu: 1.8,
    memMb: 74
  },
  {
    id: 'git',
    transport: 'stdio',
    command: 'uvx mcp-server-git --repository ~/code/app',
    running: true,
    tools: 12,
    callsPerMin: 6,
    cpu: 0.9,
    memMb: 41
  },
  {
    id: 'playwright',
    transport: 'stdio',
    command: 'npx @playwright/mcp@latest',
    running: false,
    tools: 21,
    callsPerMin: 0,
    cpu: 0,
    memMb: 0
  }
]

export const devices: Device[] = [
  {
    id: 'alice',
    name: "Alice's MacBook",
    user: 'alice@tailnet',
    ip: '100.64.12.21',
    client: 'Claude Desktop',
    status: 'online',
    lastSeen: '14:32',
    since: '12:18',
    latencyMs: 72,
    callsToday: 412,
    servers: ['filesystem', 'git'],
    traffic: wave(12, 6, 0)
  },
  {
    id: 'bob',
    name: "Bob's ThinkPad",
    user: 'bob@tailnet',
    ip: '100.64.12.34',
    client: 'VS Code',
    status: 'online',
    lastSeen: '14:29',
    since: '13:40',
    latencyMs: 118,
    callsToday: 96,
    servers: ['git'],
    traffic: wave(5, 3, 2)
  },
  {
    id: 'priya',
    name: "Priya's Desktop",
    user: 'priya@tailnet',
    ip: '100.64.12.47',
    client: 'Claude Desktop',
    status: 'offline',
    lastSeen: 'yesterday at 18:04',
    since: '—',
    latencyMs: 0,
    callsToday: 0,
    servers: ['filesystem', 'git', 'playwright'],
    traffic: Array(30).fill(0)
  },
  {
    id: 'unknown',
    name: 'Unknown device',
    user: 'not in policy',
    ip: '100.88.3.40',
    client: 'Unknown client',
    status: 'blocked',
    lastSeen: '14:27',
    since: '—',
    latencyMs: 0,
    callsToday: 0,
    servers: [],
    traffic: Array(30).fill(0)
  }
]

const ev = (
  id: number,
  at: string,
  deviceId: string,
  tool: string,
  ms: number,
  outcome: ActivityEvent['outcome'] = 'allowed'
): ActivityEvent => ({ id: String(id), at, deviceId, tool, ms, outcome })

export const activity: ActivityEvent[] = [
  ev(1, '14:32:08', 'alice', 'filesystem__read_file', 41),
  ev(2, '14:31:52', 'alice', 'git__search_repository', 230),
  ev(3, '14:31:40', 'alice', 'filesystem__list_directory', 18),
  ev(4, '14:30:11', 'alice', 'playwright__run_test', 2, 'denied'),
  ev(5, '14:29:47', 'bob', 'git__log', 96),
  ev(6, '14:29:02', 'bob', 'git__diff', 144),
  ev(7, '14:28:30', 'alice', 'filesystem__read_file', 37),
  ev(8, '14:27:55', 'unknown', 'filesystem__read_file', 1, 'denied'),
  ev(9, '14:27:51', 'unknown', 'filesystem__list_directory', 1, 'denied'),
  ev(10, '14:26:14', 'bob', 'filesystem__read_file', 2, 'denied'),
  ev(11, '18:04:22', 'priya', 'git__status', 88),
  ev(12, '18:03:10', 'priya', 'filesystem__read_file', 52)
]
