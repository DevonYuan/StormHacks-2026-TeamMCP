/**
 * Network data provider.
 *
 * Polls the gateway (through the Electron preload bridge) and exposes the
 * Network page's view models. Degrades to empty data when the bridge is absent
 * (e.g. the renderer opened in a plain browser) or the gateway is not running.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActivityEntry, ActivityStats, GatewayStatus, ServerHealth } from '@shared/activity'
import type { PolicyDocument } from '@shared/policy'
import type { ServerConfig } from '@shared/protocol'
import type {
  ActivityEvent,
  AddPeerResult,
  Device,
  GatewayMetrics,
  Host,
  Machine,
  Server,
  ShareInfo,
  TailnetDevicesResponse,
  TailscaleInfo,
} from '@shared/types'
import { useAuth } from '../auth/AuthContext'
import {
  countCallsPerMinute,
  toActivityEvents,
  toDevices,
  toGatewayMetrics,
  toHost,
  toMachines,
  toServers,
  blockRuleId,
} from './adapters'

const POLL_MS = 2000

const EMPTY_POLICY: PolicyDocument = {
  version: 1,
  defaultEffect: 'deny',
  rules: [],
  updatedAt: 0,
  updatedBy: 'system',
}

const EMPTY_TAILSCALE: TailscaleInfo = { available: false, ip: null, hostname: null, dnsName: null }
const EMPTY_TAILNET_DEVICES: TailnetDevicesResponse = { available: false, self: null, devices: [] }

interface Snapshot {
  status: GatewayStatus | null
  servers: ServerConfig[]
  health: ServerHealth[]
  activity: ActivityEntry[]
  policy: PolicyDocument
  stats: ActivityStats | null
  tailscale: TailscaleInfo
  tailnetDevices: TailnetDevicesResponse
}

const EMPTY_SNAPSHOT: Snapshot = {
  status: null,
  servers: [],
  health: [],
  activity: [],
  policy: EMPTY_POLICY,
  stats: null,
  tailscale: EMPTY_TAILSCALE,
  tailnetDevices: EMPTY_TAILNET_DEVICES,
}

export interface NetworkData {
  /** True when the Electron preload bridge is present. */
  available: boolean
  error: string | null
  host: Host
  servers: Server[]
  devices: Device[]
  /** Machine rows for the Machines page (tailnet nodes merged with activity). */
  machines: Machine[]
  activity: ActivityEvent[]
  metrics: GatewayMetrics
  callsPerMin: number
  /** Denied (403) calls seen in the activity log. */
  authFailures: number
  status: GatewayStatus | null
  tailscale: TailscaleInfo
  updatedAt: number
  /** Force an immediate re-fetch instead of waiting for the next poll. */
  refresh: () => Promise<void>
  startGateway: () => Promise<void>
  stopGateway: () => Promise<void>
  /** Bind the tailnet interface (when available) and start the gateway so peers can connect. */
  expose: () => Promise<void>
  /** Canonical share info for the expose modal. */
  getShare: () => Promise<ShareInfo>
  /** Register a teammate's exposed gateway as a streamable-HTTP upstream. */
  addPeer: (address: string, accountId?: string) => Promise<AddPeerResult>
  /** Validate a peer address without keeping it registered. */
  probePeer: (address: string, accountId?: string) => Promise<AddPeerResult>
  removePeer: (id: string) => Promise<{ success: boolean }>
  /** Add / remove a high-priority deny rule for one tailnet device. */
  setBlocked: (machine: Machine, blocked: boolean) => Promise<void>
  /** Close a device's open sessions on this gateway (it may reconnect unless blocked). */
  disconnect: (deviceId: string) => Promise<number>
}

const NetworkDataContext = createContext<NetworkData | null>(null)

/** Resolve to `null` instead of rejecting, so one failing call can't blank the page. */
function settle<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null)
}

async function loadSnapshot(): Promise<Snapshot> {
  const api = window.electronAPI
  if (!api) return EMPTY_SNAPSHOT

  const [status, servers, health, activity, policy, stats, tailscale, tailnetDevices] =
    await Promise.all([
      settle(api.gateway.getStatus()),
      settle(api.servers.getAll()),
      settle(api.health.getAll()),
      settle(api.activity.query({ limit: 200 })),
      settle(api.policy.get()),
      settle(api.activity.getStats()),
      settle(api.tailscale.getStatus()),
      settle(api.tailscale.getDevices()),
    ])

  return {
    status,
    servers: servers ?? [],
    health: health ?? [],
    activity: activity ?? [],
    policy: policy ?? EMPTY_POLICY,
    stats,
    tailscale: tailscale ?? EMPTY_TAILSCALE,
    tailnetDevices: tailnetDevices ?? EMPTY_TAILNET_DEVICES,
  }
}

export function NetworkDataProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { mode, user } = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const next = await loadSnapshot()
      setSnapshot(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = setInterval(() => void reload(), POLL_MS)
    return () => clearInterval(id)
  }, [reload])

  const data = useMemo<NetworkData>(() => {
    const now = Date.now()
    const allServerIds = snapshot.servers.map((c) => c.id)
    const tailnetDevices = mode === 'client' && user?.tailscaleUser
      ? {
          available: snapshot.tailnetDevices.available,
          self: snapshot.tailnetDevices.self?.user?.toLowerCase() === user.tailscaleUser.toLowerCase()
            ? snapshot.tailnetDevices.self
            : null,
          devices: snapshot.tailnetDevices.devices.filter(
            (device) => device.user?.toLowerCase() === user.tailscaleUser?.toLowerCase()
          ),
        }
      : snapshot.tailnetDevices
    return {
      available: Boolean(window.electronAPI),
      error,
      host: toHost(snapshot.tailscale, snapshot.status, snapshot.servers.length),
      servers: toServers(snapshot.servers, snapshot.health, snapshot.activity, now),
      devices: toDevices(snapshot.activity, snapshot.policy, allServerIds, now),
      machines: toMachines(
        tailnetDevices,
        snapshot.status,
        snapshot.activity,
        snapshot.policy,
        allServerIds,
        now
      ),
      activity: toActivityEvents(snapshot.activity),
      metrics: toGatewayMetrics(snapshot.activity, now),
      callsPerMin: countCallsPerMinute(snapshot.activity, now),
      authFailures:
        snapshot.stats?.errorsByCode?.['403'] ??
        snapshot.activity.filter((e) => e.errorCode === 403).length,
      status: snapshot.status,
      tailscale: snapshot.tailscale,
      updatedAt: now,
      refresh: reload,
      startGateway: async () => {
        await window.electronAPI?.gateway.start()
      },
      stopGateway: async () => {
        await window.electronAPI?.gateway.stop()
      },
      expose: async () => {
        await window.electronAPI?.gateway.expose()
      },
      getShare: async () => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to expose the gateway')
        return api.share.get()
      },
      addPeer: async (address: string, accountId?: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to connect to a peer')
        return api.peers.add(address, false, accountId)
      },
      probePeer: async (address: string, accountId?: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to test a peer')
        return api.peers.add(address, true, accountId)
      },
      removePeer: async (id: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to remove a peer')
        return api.peers.remove(id)
      },
      setBlocked: async (machine: Machine, blocked: boolean) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to change access')
        const id = blockRuleId(machine.deviceId)
        await (blocked
          ? api.policy.addRule({
              id,
              name: `Block ${machine.name}`,
              identities: [{ user: '', device: '', deviceId: machine.deviceId, tailnet: '' }],
              effect: 'deny',
              priority: 1000,
              description: 'Added from the Machines page.',
            })
          : api.policy.removeRule(id))
        await reload()
      },
      disconnect: async (deviceId: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to disconnect a device')
        const { closed } = await api.sessions.disconnect(deviceId)
        await reload()
        return closed
      },
    }
  }, [snapshot, error, reload, mode, user?.tailscaleUser])

  return <NetworkDataContext.Provider value={data}>{children}</NetworkDataContext.Provider>
}

export function useNetworkData(): NetworkData {
  const value = useContext(NetworkDataContext)
  if (!value) throw new Error('useNetworkData must be used within NetworkDataProvider')
  return value
}
