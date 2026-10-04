/**
 * Network data provider.
 *
 * Polls the gateway (through the Electron preload bridge) and exposes the
 * Network page's view models. Degrades to empty data when the bridge is absent
 * (e.g. the renderer opened in a plain browser) or the gateway is not running.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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

/** Sidebar and Connected peers. Cheap local reads, so this can stay short. */
const CORE_POLL_MS = 1000
/** Activity, policy, and tailnet probes. Heavier, so it stays on a slower tick. */
const FULL_POLL_MS = 2000

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
  /** True while the gateway process is starting. */
  opening: boolean
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
  addPeer: (address: string) => Promise<AddPeerResult>
  /** Validate a peer address without keeping it registered. */
  probePeer: (address: string) => Promise<AddPeerResult>
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
  const { mode } = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  /** Ids removed locally. In-flight polls must not put them back. */
  const hiddenServerIds = useRef(new Set<string>())
  const coreEpoch = useRef(0)
  const fullEpoch = useRef(0)

  const withoutHidden = useCallback((next: Snapshot): Snapshot => {
    const hidden = hiddenServerIds.current
    if (hidden.size === 0) return next
    return {
      ...next,
      servers: next.servers.filter((server) => !hidden.has(server.id)),
      health: next.health.filter((health) => !hidden.has(health.serverId)),
    }
  }, [])

  const reloadCore = useCallback(async (): Promise<void> => {
    const api = window.electronAPI
    if (!api) return
    const epoch = ++coreEpoch.current
    const [status, servers, health] = await Promise.all([
      settle(api.gateway.getStatus()),
      settle(api.servers.getAll()),
      settle(api.health.getAll()),
    ])
    if (epoch !== coreEpoch.current) return
    setSnapshot((prev) =>
      withoutHidden({
        ...prev,
        status,
        servers: servers ?? [],
        health: health ?? [],
      })
    )
    setError(null)
  }, [withoutHidden])

  const reload = useCallback(async (): Promise<void> => {
    const epoch = ++fullEpoch.current
    const coreAtStart = coreEpoch.current
    try {
      const next = await loadSnapshot()
      if (epoch !== fullEpoch.current) return
      setSnapshot((prev) => {
        const merged =
          coreEpoch.current === coreAtStart
            ? next
            : { ...next, status: prev.status, servers: prev.servers, health: prev.health }
        return withoutHidden(merged)
      })
      setError(null)
    } catch (e) {
      if (epoch !== fullEpoch.current) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [withoutHidden])

  useEffect(() => {
    void reload()
    const core = setInterval(() => void reloadCore(), CORE_POLL_MS)
    const full = setInterval(() => void reload(), FULL_POLL_MS)
    return () => {
      clearInterval(core)
      clearInterval(full)
    }
  }, [reload, reloadCore])

  const data = useMemo<NetworkData>(() => {
    const now = Date.now()
    const allServerIds = snapshot.servers.map((c) => c.id)
    const clientTailscaleUser = snapshot.tailnetDevices.self?.user?.toLowerCase()
    const tailnetDevices = mode === 'client' && clientTailscaleUser
      ? {
          available: snapshot.tailnetDevices.available,
          self: snapshot.tailnetDevices.self,
          devices: snapshot.tailnetDevices.devices.filter(
            (device) => device.user?.toLowerCase() === clientTailscaleUser
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
      opening,
      tailscale: snapshot.tailscale,
      updatedAt: now,
      refresh: reload,
      startGateway: async () => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to start the gateway')
        setOpening(true)
        try {
          await api.gateway.start()
          await reload()
        } finally {
          setOpening(false)
        }
      },
      stopGateway: async () => {
        await window.electronAPI?.gateway.stop()
        await reload()
      },
      expose: async () => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to expose the gateway')
        setOpening(true)
        try {
          await api.gateway.expose()
          await reload()
        } finally {
          setOpening(false)
        }
      },
      getShare: async () => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to expose the gateway')
        return api.share.get()
      },
      addPeer: async (address: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to connect to a peer')
        const result = await api.peers.add(address, false)
        await reloadCore()
        return result
      },
      probePeer: async (address: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to test a peer')
        return api.peers.add(address, true)
      },
      removePeer: async (id: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to remove a peer')
        hiddenServerIds.current.add(id)
        coreEpoch.current += 1
        setSnapshot((prev) =>
          withoutHidden({
            ...prev,
            servers: prev.servers.filter((server) => server.id !== id),
            health: prev.health.filter((health) => health.serverId !== id),
          })
        )
        try {
          const result = await api.peers.remove(id)
          await reloadCore()
          return result
        } catch (error) {
          hiddenServerIds.current.delete(id)
          void reloadCore()
          throw error
        } finally {
          hiddenServerIds.current.delete(id)
        }
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
  }, [snapshot, error, opening, reload, reloadCore, withoutHidden, mode])

  return <NetworkDataContext.Provider value={data}>{children}</NetworkDataContext.Provider>
}

export function useNetworkData(): NetworkData {
  const value = useContext(NetworkDataContext)
  if (!value) throw new Error('useNetworkData must be used within NetworkDataProvider')
  return value
}
