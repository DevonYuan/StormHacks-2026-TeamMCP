import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ServerConfig,
  PolicyDocument,
  PolicyRule,
  ActivityQuery,
  ActivityStats,
  ActivityEntry,
  ServerHealth,
  GatewayStatus,
  GatewayConfig,
} from '../../../shared/index.js'

type ServerInput = Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>

interface TailscaleInfo {
  available: boolean
  ip: string | null
  hostname: string | null
  dnsName: string | null
}

// Shape of the bridge exposed by the preload script (src/preload/index.ts)
interface ElectronBridge {
  gateway: {
    getStatus(): Promise<GatewayStatus>
    start(): Promise<unknown>
    stop(): Promise<unknown>
  }
  servers: {
    getAll(): Promise<ServerConfig[]>
    create(server: ServerInput): Promise<{ success: boolean; server: ServerConfig }>
    update(id: string, updates: Partial<ServerConfig>): Promise<{ success: boolean }>
    delete(id: string): Promise<{ success: boolean }>
    connect(id: string): Promise<{ success: boolean }>
    disconnect(id: string): Promise<{ success: boolean }>
  }
  policy: {
    get(): Promise<PolicyDocument>
    update(policy: PolicyDocument): Promise<unknown>
    addRule(rule: PolicyRule): Promise<unknown>
    removeRule(ruleId: string): Promise<unknown>
  }
  activity: {
    query(query: ActivityQuery): Promise<ActivityEntry[]>
    getStats(): Promise<ActivityStats>
  }
  health: {
    getAll(): Promise<ServerHealth[]>
  }
  config: {
    get(): Promise<{ gateway: GatewayConfig }>
    update(updates: Partial<GatewayConfig>): Promise<unknown>
  }
  tailscale: {
    getStatus(): Promise<TailscaleInfo>
  }
}

const GATEWAY_URL = 'http://127.0.0.1:8788'

function bridge(): ElectronBridge | undefined {
  return (window as unknown as { electronAPI?: ElectronBridge }).electronAPI
}

// Fallback HTTP client used when running in a plain browser (e.g. Playwright).
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export const EMPTY_ACTIVITY_STATS: ActivityStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  uniqueUsers: 0,
  uniqueServers: 0,
  avgDurationMs: 0,
  byMethod: {},
  byServer: {},
  byTool: {},
  byIdentity: {},
  errorsByCode: {},
}

const api = {
  gateway: {
    getStatus: async (): Promise<GatewayStatus> => {
      const b = bridge()
      if (b) return b.gateway.getStatus()
      return http<GatewayStatus>('/api/status')
    },
    start: async (): Promise<void> => {
      await bridge()?.gateway.start()
    },
    stop: async (): Promise<void> => {
      await bridge()?.gateway.stop()
    },
  },
  servers: {
    getAll: async (): Promise<ServerConfig[]> => {
      const b = bridge()
      if (b) return b.servers.getAll()
      return http<ServerConfig[]>('/api/servers')
    },
    create: async (server: ServerInput) => {
      const b = bridge()
      if (b) return b.servers.create(server)
      const created = await http<ServerConfig>('/api/servers', {
        method: 'POST',
        body: JSON.stringify(server),
      })
      return { success: true, server: created }
    },
    update: async (id: string, updates: Partial<ServerConfig>) => {
      const b = bridge()
      if (b) return b.servers.update(id, updates)
      await http<ServerConfig>(`/api/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      return { success: true }
    },
    delete: async (id: string) => {
      const b = bridge()
      if (b) return b.servers.delete(id)
      return http<{ success: boolean }>(`/api/servers/${id}`, { method: 'DELETE' })
    },
    connect: async (id: string) => {
      const b = bridge()
      if (b) return b.servers.connect(id)
      return http<{ success: boolean }>(`/api/servers/${id}/connect`, { method: 'POST' })
    },
    disconnect: async (id: string) => {
      const b = bridge()
      if (b) return b.servers.disconnect(id)
      return http<{ success: boolean }>(`/api/servers/${id}/disconnect`, { method: 'POST' })
    },
  },
  policy: {
    get: async (): Promise<PolicyDocument> => {
      const b = bridge()
      if (b) return b.policy.get()
      return http<PolicyDocument>('/api/policy')
    },
    update: async (policy: PolicyDocument) => {
      const b = bridge()
      if (b) return b.policy.update(policy)
      return http('/api/policy', { method: 'PUT', body: JSON.stringify(policy) })
    },
    addRule: async (rule: PolicyRule) => {
      const b = bridge()
      if (b) return b.policy.addRule(rule)
      return http('/api/policy', { method: 'PUT', body: JSON.stringify(rule) })
    },
    removeRule: async (ruleId: string) => {
      const b = bridge()
      if (b) return b.policy.removeRule(ruleId)
      return http('/api/policy', { method: 'PUT', body: JSON.stringify({ ruleId }) })
    },
  },
  activity: {
    query: async (query: ActivityQuery): Promise<ActivityEntry[]> => {
      const b = bridge()
      if (b) return b.activity.query(query)
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
      }
      return http<ActivityEntry[]>(`/api/activity?${params.toString()}`)
    },
    getStats: async (): Promise<ActivityStats> => {
      const b = bridge()
      if (b) return b.activity.getStats()
      return http<ActivityStats>('/api/activity/stats')
    },
  },
  health: {
    getAll: async (): Promise<ServerHealth[]> => {
      const b = bridge()
      if (b) return b.health.getAll()
      return http<ServerHealth[]>('/api/health')
    },
  },
  config: {
    get: async (): Promise<{ gateway: GatewayConfig }> => {
      const b = bridge()
      if (b) return b.config.get()
      return http<{ gateway: GatewayConfig }>('/api/status')
    },
    update: async (updates: Partial<GatewayConfig>) => {
      const b = bridge()
      if (b) return b.config.update(updates)
      return { success: true }
    },
  },
  tailscale: {
    getStatus: async (): Promise<TailscaleInfo> => {
      const b = bridge()
      if (b) return b.tailscale.getStatus()
      return http<TailscaleInfo>('/api/tailscale')
    },
  },
}

// Gateway status hook
export function useGatewayStatus() {
  return useQuery({
    queryKey: ['gateway', 'status'],
    queryFn: api.gateway.getStatus,
    refetchInterval: 5000,
  })
}

// Servers hook
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: api.servers.getAll,
    refetchInterval: 10000,
  })
}

export function useServer(id: string) {
  return useQuery({
    queryKey: ['servers', id],
    queryFn: () => api.servers.getAll().then((s) => s.find((x) => x.id === id)),
    enabled: !!id,
  })
}

// Policy hook
export function usePolicy() {
  return useQuery({
    queryKey: ['policy'],
    queryFn: api.policy.get,
    refetchInterval: 30000,
  })
}

// Activity hooks
export function useActivity(query: ActivityQuery) {
  return useQuery({
    queryKey: ['activity', query],
    queryFn: () => api.activity.query(query),
    refetchInterval: 5000,
  })
}

export function useActivityStats() {
  return useQuery({
    queryKey: ['activity', 'stats'],
    queryFn: api.activity.getStats,
    refetchInterval: 10000,
    placeholderData: EMPTY_ACTIVITY_STATS,
  })
}

// Health hook
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.health.getAll,
    refetchInterval: 10000,
  })
}

// Config hook
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: api.config.get,
    staleTime: 60000,
  })
}

// Tailscale hook
export function useTailscaleStatus() {
  return useQuery({
    queryKey: ['tailscale', 'status'],
    queryFn: api.tailscale.getStatus,
    refetchInterval: 30000,
  })
}

// Mutation hooks
export function useCreateServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (server: ServerInput) => api.servers.create(server),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

export function useUpdateServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ServerConfig> }) =>
      api.servers.update(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

export function useDeleteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.servers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

export function useUpdatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (policy: PolicyDocument) => api.policy.update(policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policy'] }),
  })
}

export function useUpdateConfig() {
  return useMutation({
    mutationFn: (updates: Partial<GatewayConfig>) => api.config.update(updates),
  })
}
