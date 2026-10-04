/**
 * Network data provider.
 *
 * Polls the gateway (through the Electron preload bridge) and exposes the
 * Network page's view models. Degrades to empty data when the bridge is absent
 * (e.g. the renderer opened in a plain browser) or the gateway is not running.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
  Server,
  ShareInfo,
  TailscaleInfo,
} from '@shared/types'
import {
  countCallsPerMinute,
  toActivityEvents,
  toDevices,
  toGatewayMetrics,
  toHost,
  toServers,
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

interface Snapshot {
  status: GatewayStatus | null
  servers: ServerConfig[]
  health: ServerHealth[]
  activity: ActivityEntry[]
  policy: PolicyDocument
  stats: ActivityStats | null
  tailscale: TailscaleInfo
}

const EMPTY_SNAPSHOT: Snapshot = {
  status: null,
  servers: [],
  health: [],
  activity: [],
  policy: EMPTY_POLICY,
  stats: null,
  tailscale: EMPTY_TAILSCALE,
}

export interface NetworkData {
  /** True when the Electron preload bridge is present. */
  available: boolean
  error: string | null
  host: Host
  servers: Server[]
  devices: Device[]
  activity: ActivityEvent[]
  metrics: GatewayMetrics
  callsPerMin: number
  status: GatewayStatus | null
  tailscale: TailscaleInfo
  updatedAt: number
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
}

const NetworkDataContext = createContext<NetworkData | null>(null)

/** Resolve to `null` instead of rejecting, so one failing call can't blank the page. */
function settle<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null)
}

async function loadSnapshot(): Promise<Snapshot> {
  const api = window.electronAPI
  if (!api) return EMPTY_SNAPSHOT

  const status = await settle(api.gateway.getStatus())
  // Without a gateway the user is neither hosting nor connected to a peer, so
  // there is nothing to read. Stop here rather than poll a process that is down.
  if (!status?.running) return { ...EMPTY_SNAPSHOT, status }

  const [servers, health, activity, policy, stats, tailscale] = await Promise.all([
    settle(api.servers.getAll()),
    settle(api.health.getAll()),
    settle(api.activity.query({ limit: 200 })),
    settle(api.policy.get()),
    settle(api.activity.getStats()),
    settle(api.tailscale.getStatus()),
  ])

  return {
    status,
    servers: servers ?? [],
    health: health ?? [],
    activity: activity ?? [],
    policy: policy ?? EMPTY_POLICY,
    stats,
    tailscale: tailscale ?? EMPTY_TAILSCALE,
  }
}

export function NetworkDataProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const next = await loadSnapshot()
        if (alive) {
          setSnapshot(next)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void run()
    const id = setInterval(() => void run(), POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const data = useMemo<NetworkData>(() => {
    const now = Date.now()
    const allServerIds = snapshot.servers.map((c) => c.id)
    return {
      available: Boolean(window.electronAPI),
      error,
      host: toHost(snapshot.tailscale, snapshot.status, snapshot.servers.length),
      servers: toServers(snapshot.servers, snapshot.health, snapshot.activity, now),
      devices: toDevices(snapshot.activity, snapshot.policy, allServerIds, now),
      activity: toActivityEvents(snapshot.activity),
      metrics: toGatewayMetrics(snapshot.activity, now),
      callsPerMin: countCallsPerMinute(snapshot.activity, now),
      status: snapshot.status,
      tailscale: snapshot.tailscale,
      updatedAt: now,
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
      addPeer: async (address: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to connect to a peer')
        return api.peers.add(address, false)
      },
      probePeer: async (address: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to test a peer')
        return api.peers.add(address, true)
      },
      removePeer: async (id: string) => {
        const api = window.electronAPI
        if (!api) throw new Error('Open the desktop app to remove a peer')
        return api.peers.remove(id)
      },
    }
  }, [snapshot, error])

  return <NetworkDataContext.Provider value={data}>{children}</NetworkDataContext.Provider>
}

export function useNetworkData(): NetworkData {
  const value = useContext(NetworkDataContext)
  if (!value) throw new Error('useNetworkData must be used within NetworkDataProvider')
  return value
}
