import { describe, it, expect } from 'vitest'
import { TransportType } from '@shared/protocol'
import type { ServerConfig } from '@shared/protocol'
import type { ActivityEntry, GatewayStatus, ServerHealth } from '@shared/activity'
import type { Identity, PolicyDocument, PolicyRule } from '@shared/policy'
import type { TailnetDevice, TailnetDevicesResponse } from '@shared/types'
import {
  accessibleServers,
  countCallsPerMinute,
  formatUptime,
  percentile,
  toActivityEvents,
  toDevices,
  toGatewayMetrics,
  toHost,
  toMachines,
  blockRuleId,
  toServers,
} from '../../src/frontend/renderer/src/data/adapters.js'

const ALICE: Identity = {
  user: 'alice@tailnet',
  device: 'alice-mac',
  deviceId: 'dev-alice',
  tailnet: 'tailnet',
}
const BOB: Identity = {
  user: 'bob@tailnet',
  device: 'bob',
  deviceId: 'dev-bob',
  tailnet: 'tailnet',
}
const MALLORY: Identity = {
  user: 'mallory@tailnet',
  device: 'mallory',
  deviceId: 'dev-mal',
  tailnet: 'tailnet',
}

function mkEntry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e',
    timestamp: 1_000,
    identity: ALICE,
    method: 'tools/call',
    serverId: 'srv-1',
    toolName: 'read_file',
    requestSummary: 'req',
    responseSummary: 'res',
    success: true,
    durationMs: 10,
    ...over,
  }
}

function mkServer(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: 'srv-1',
    name: 'Filesystem',
    transport: TransportType.Stdio,
    command: 'npx',
    args: ['-y', 'server-filesystem'],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function health(serverId: string, status: ServerHealth['status']): ServerHealth {
  return { serverId, status, consecutiveFailures: 0 }
}

function policy(rules: PolicyRule[], defaultEffect: 'allow' | 'deny' = 'deny'): PolicyDocument {
  return { version: 1, defaultEffect, rules, updatedAt: 0, updatedBy: 'test' }
}

function rule(over: Partial<PolicyRule> = {}): PolicyRule {
  return { id: 'r', name: 'r', effect: 'allow', priority: 10, ...over }
}

describe('adapters', () => {
  describe('toActivityEvents', () => {
    it('maps entries to view events with namespaced tools and outcomes', () => {
      const ts = new Date(2026, 0, 2, 14, 32, 8).getTime()
      const [ev] = toActivityEvents([
        mkEntry({
          timestamp: ts,
          serverId: 'filesystem',
          toolName: 'read_file',
          success: false,
          durationMs: 41,
        }),
      ])
      expect(ev.at).toBe('14:32:08')
      expect(ev.tool).toBe('filesystem__read_file')
      expect(ev.outcome).toBe('denied')
      expect(ev.ms).toBe(41)
      expect(ev.deviceId).toBe('dev-alice')
    })

    it('falls back to the server id when there is no tool name', () => {
      const [ev] = toActivityEvents([mkEntry({ toolName: undefined, serverId: 'srv-9' })])
      expect(ev.tool).toBe('srv-9')
    })
  })

  describe('percentile', () => {
    it('returns 0 for an empty series', () => {
      expect(percentile([], 50)).toBe(0)
    })
    it('computes nearest-rank percentiles', () => {
      expect(percentile([10, 20, 30, 40], 50)).toBe(20)
      expect(percentile([10, 20, 30, 40], 95)).toBe(40)
    })
  })

  describe('toGatewayMetrics', () => {
    it('computes percentiles, recent denials and today\'s successes', () => {
      const now = new Date(2026, 0, 2, 12, 0, 0).getTime()
      const entries = [
        mkEntry({ id: 'a', timestamp: now - 1_000, durationMs: 10, success: true }),
        mkEntry({ id: 'b', timestamp: now - 2_000, durationMs: 20, success: true }),
        mkEntry({ id: 'c', timestamp: now - 3_000, durationMs: 30, success: false }),
        // Older than 24h and on the previous day.
        mkEntry({ id: 'd', timestamp: now - 30 * 3600 * 1000, durationMs: 40, success: false }),
      ]
      const m = toGatewayMetrics(entries, now)
      expect(m.p50).toBe(20)
      expect(m.p95).toBe(40)
      expect(m.denied24h).toBe(1)
      expect(m.proxiedToday).toBe(2)
    })
  })

  describe('countCallsPerMinute', () => {
    it('counts only entries within the last minute', () => {
      const now = 10 * 60_000
      const entries = [
        mkEntry({ timestamp: now - 1_000 }),
        mkEntry({ timestamp: now - 59_000 }),
        mkEntry({ timestamp: now - 61_000 }),
      ]
      expect(countCallsPerMinute(entries, now)).toBe(2)
    })
  })

  describe('toServers', () => {
    it('maps config + health into view servers', () => {
      const now = 10 * 60_000
      const servers = toServers(
        [mkServer({ id: 'srv-1', name: 'Filesystem' })],
        [health('srv-1', 'healthy')],
        [
          mkEntry({ timestamp: now - 1_000, serverId: 'srv-1', toolName: 'read_file' }),
          mkEntry({ id: 'b', timestamp: now - 2_000, serverId: 'srv-1', toolName: 'list_directory' }),
        ],
        now
      )
      expect(servers[0]).toMatchObject({
        id: 'srv-1',
        name: 'Filesystem',
        transport: 'stdio',
        running: true,
        tools: 2,
        callsPerMin: 2,
        cpu: null,
        memMb: null,
      })
      expect(servers[0].command).toBe('npx -y server-filesystem')
    })

    it('is not running when health is not healthy', () => {
      const servers = toServers([mkServer()], [health('srv-1', 'unhealthy')], [], 0)
      expect(servers[0].running).toBe(false)
    })
  })

  describe('accessibleServers', () => {
    it('grants all servers for a matching allow-all rule', () => {
      const p = policy([rule({ identities: [{ ...ALICE }] })])
      expect(accessibleServers(p, ALICE, ['s1', 's2'])).toEqual(['s1', 's2'])
    })

    it('filters to the rule\'s server list', () => {
      const p = policy([rule({ servers: ['s2'] })])
      expect(accessibleServers(p, ALICE, ['s1', 's2'])).toEqual(['s2'])
    })

    it('returns none for a deny rule or a deny default', () => {
      expect(accessibleServers(policy([rule({ effect: 'deny' })]), ALICE, ['s1'])).toEqual([])
      expect(accessibleServers(policy([], 'deny'), ALICE, ['s1'])).toEqual([])
    })

    it('honours an allow default', () => {
      expect(accessibleServers(policy([], 'allow'), ALICE, ['s1'])).toEqual(['s1'])
    })
  })

  describe('toDevices', () => {
    const now = new Date(2026, 0, 2, 12, 0, 0).getTime()
    const p = policy([
      rule({ id: 'allow-a', identities: [{ ...ALICE }] }),
      rule({ id: 'allow-b', identities: [{ ...BOB }] }),
    ])
    const entries = [
      mkEntry({ id: '1', timestamp: now - 1_000, identity: ALICE, durationMs: 10 }),
      mkEntry({ id: '2', timestamp: now - 2_000, identity: ALICE, durationMs: 20 }),
      mkEntry({ id: '3', timestamp: now - 3 * 3600 * 1000, identity: BOB, durationMs: 30 }),
      mkEntry({ id: '4', timestamp: now - 1_000, identity: MALLORY, success: false, durationMs: 1 }),
    ]
    const devices = toDevices(entries, p, ['s1'], now)

    it('groups by identity and derives status', () => {
      expect(devices.find((d) => d.id === 'dev-alice')?.status).toBe('online')
      expect(devices.find((d) => d.id === 'dev-bob')?.status).toBe('offline')
      expect(devices.find((d) => d.id === 'dev-mal')?.status).toBe('blocked')
    })

    it('derives per-device aggregates', () => {
      const alice = devices.find((d) => d.id === 'dev-alice')!
      expect(alice.callsToday).toBe(2)
      expect(alice.latencyMs).toBe(15)
      expect(alice.servers).toEqual(['s1'])
      expect(alice.traffic.at(-1)).toBe(2)
      expect(alice.user).toBe('alice@tailnet')
    })

    it('marks identities with no policy access as blocked with no servers', () => {
      const mallory = devices.find((d) => d.id === 'dev-mal')!
      expect(mallory.servers).toEqual([])
    })

    it('sorts online devices first', () => {
      expect(devices[0].status).toBe('online')
    })
  })

  describe('toHost', () => {
    const status: GatewayStatus = {
      running: true,
      uptimeMs: 2 * 3600 * 1000 + 14 * 60 * 1000,
      boundAddress: '127.0.0.1',
      port: 8788,
      connectedPeers: 0,
      totalRequests: 0,
      activeSessions: 0,
    }

    it('uses tailnet identity when available', () => {
      expect(
        toHost(
          { available: true, ip: '100.1.2.3', hostname: 'host', dnsName: 'host.ts.net' },
          status,
          3
        )
      ).toEqual({
        name: 'host',
        ip: '100.1.2.3',
        dns: 'host.ts.net',
        port: 8788,
        uptime: '2h 14m',
        sharedServers: 3,
      })
    })

    it('falls back to loopback when tailscale is unavailable', () => {
      expect(
        toHost({ available: false, ip: null, hostname: null, dnsName: null }, null, 0)
      ).toEqual({
        name: 'This machine',
        ip: '127.0.0.1',
        dns: '127.0.0.1:8788',
        port: 8788,
        uptime: '0s',
        sharedServers: 0,
      })
    })
  })

  describe('formatUptime', () => {
    it('formats hours, minutes and seconds', () => {
      expect(formatUptime(2 * 3600_000 + 14 * 60_000)).toBe('2h 14m')
      expect(formatUptime(5 * 60_000)).toBe('5m')
      expect(formatUptime(42_000)).toBe('42s')
    })
  })

  describe('toMachines', () => {
    const now = new Date(2026, 0, 2, 12, 0, 0).getTime()
    const status: GatewayStatus = {
      running: true,
      uptimeMs: 1_000,
      boundAddress: '127.0.0.1',
      port: 8788,
      connectedPeers: 0,
      totalRequests: 0,
      activeSessions: 0,
    }
    const allowAll = policy([rule({ id: 'allow-all' })], 'allow')

    function tDevice(over: Partial<TailnetDevice> = {}): TailnetDevice {
      return {
        id: 'node-1',
        stableId: 'stable-1',
        hostname: 'alice-mac',
        dnsName: 'alice-mac.tailnet.ts.net.',
        ips: ['100.64.0.5'],
        online: true,
        lastSeen: null,
        os: 'macOS',
        tags: [],
        user: 'alice@tailnet',
        self: false,
        ...over,
      }
    }

    function tailnet(
      over: Partial<TailnetDevicesResponse> = {}
    ): TailnetDevicesResponse {
      return { available: true, self: null, devices: [], ...over }
    }

    it('lists Self and peers with tailnet IPs and identity', () => {
      const machines = toMachines(
        tailnet({
          self: tDevice({
            id: 'self',
            hostname: 'devon-mac',
            dnsName: 'devon-mac.ts.net.',
            user: 'devon@tailnet',
            self: true,
          }),
          devices: [tDevice({ gatewayUp: true })],
        }),
        status,
        [],
        allowAll,
        ['s1'],
        now
      )

      const self = machines.find((m) => m.badge === 'Local')!
      expect(self.name).toBe('devon-mac')
      expect(self.gatewayId).toBe('127.0.0.1:8788')
      expect(self.status).toBe('connected')

      const peer = machines.find((m) => m.id === 'tailnet:node-1')!
      expect(peer.ip).toBe('100.64.0.5')
      expect(peer.subtitle).toBe('alice@tailnet · tailnet')
      expect(peer.status).toBe('connected')
      expect(peer.mcpUrl).toBe('http://100.64.0.5:8788/mcp')
    })

    const peerStatus = (
      device: Partial<TailnetDevice>,
      entries: ActivityEntry[] = [],
      doc: PolicyDocument = allowAll
    ) =>
      toMachines(tailnet({ devices: [tDevice(device)] }), status, entries, doc, ['s1'], now).find(
        (m) => m.id === 'tailnet:node-1'
      )!

    it('is disconnected when on the tailnet with no gateway and no session', () => {
      expect(peerStatus({ online: true }).status).toBe('disconnected')
      expect(peerStatus({ online: true, gatewayUp: false, sessions: 0 }).status).toBe('disconnected')
    })

    it('is offline when Tailscale cannot see the device', () => {
      expect(peerStatus({ online: false }).status).toBe('offline')
    })

    it('marks Self disconnected while our gateway is stopped', () => {
      const machines = toMachines(
        tailnet({ self: tDevice({ id: 'self', self: true }) }),
        { ...status, running: false },
        [],
        allowAll,
        ['s1'],
        now
      )
      expect(machines[0].status).toBe('disconnected')
    })

    it('is connected while their gateway answers or they hold a session on ours', () => {
      expect(peerStatus({ gatewayUp: true }).status).toBe('connected')
      expect(peerStatus({ sessions: 1 }).status).toBe('connected')
    })

    it('ignores recent activity once a tailnet peer stops', () => {
      const recent = mkEntry({ timestamp: now - 1_000, identity: { ...ALICE, deviceId: 'node-1' } })
      expect(peerStatus({ online: false, gatewayUp: true }, [recent]).status).toBe('offline')
    })

    it('marks a blocked device denied, and clears it after unblock', () => {
      const blockRule = rule({ id: blockRuleId('node-1'), effect: 'deny', priority: 1000, identities: [{ user: '', device: '', deviceId: 'node-1', tailnet: '' }] })
      const blocked = peerStatus({ gatewayUp: true }, [], policy([blockRule, rule({ id: 'allow-all' })], 'allow'))
      expect(blocked).toMatchObject({ status: 'denied', blocked: true })

      const denied = mkEntry({ timestamp: now - 5_000, errorCode: 403, success: false, identity: { ...ALICE, deviceId: 'node-1' } })
      const unblocked = { ...allowAll, updatedAt: now - 1_000 }
      expect(peerStatus({ gatewayUp: true }, [denied], unblocked)).toMatchObject({ status: 'connected', blocked: false })
    })

    it('marks a peer denied when the policy grants no servers', () => {
      const machines = toMachines(
        tailnet({ devices: [tDevice()] }),
        status,
        [],
        policy([], 'deny'),
        ['s1'],
        now
      )
      expect(machines.find((m) => m.id === 'tailnet:node-1')!.status).toBe('denied')
    })

    it('keeps activity-only identities with an unknown IP', () => {
      const machines = toMachines(
        tailnet({ self: tDevice({ id: 'self', self: true }) }),
        status,
        [mkEntry({ timestamp: now - 1_000, identity: BOB })],
        allowAll,
        ['s1'],
        now
      )
      const bob = machines.find((m) => m.name === 'bob')!
      expect(bob.ip).toBe('—')
      expect(bob.badge).toBe('Peer')
    })

    it('does not duplicate the loopback identity when Self is present', () => {
      const local = mkEntry({
        timestamp: now - 1_000,
        identity: {
          user: 'local@dev',
          device: 'localhost',
          deviceId: 'local-dev-device',
          tailnet: 'local',
        },
      })
      const machines = toMachines(
        tailnet({ self: tDevice({ id: 'self', self: true }) }),
        status,
        [local],
        allowAll,
        ['s1'],
        now
      )
      expect(machines.filter((m) => m.badge === 'Local')).toHaveLength(1)
    })

    it('falls back to a local gateway row when Tailscale is unavailable', () => {
      const machines = toMachines(
        tailnet({ available: false }),
        status,
        [],
        allowAll,
        ['s1'],
        now
      )
      expect(machines).toHaveLength(1)
      expect(machines[0]).toMatchObject({
        id: 'local-gateway',
        status: 'connected',
        badge: 'Local',
      })
    })
  })
})
