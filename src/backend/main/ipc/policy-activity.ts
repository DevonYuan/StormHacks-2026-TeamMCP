import { ipcMain } from 'electron'
import type { ActivityEntry, ActivityQuery, ActivityStats } from '../../shared/activity.js'
import type { PolicyDocument, PolicyRule } from '../../shared/policy.js'
import { IPC_CHANNELS } from '../../shared/ipc.js'

interface PolicyActivityIpcDependencies {
  gatewayFetch<T>(path: string, init?: RequestInit): Promise<T>
  gatewayFetchOr<T>(path: string, fallback: T, init?: RequestInit): Promise<T>
  ensureGatewayRunning(): Promise<void>
}

const EMPTY_ACTIVITY_STATS: ActivityStats = {
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

/** Register renderer IPC handlers for policy management and activity queries. */
export function registerPolicyActivityIpcHandlers({
  gatewayFetch,
  gatewayFetchOr,
  ensureGatewayRunning,
}: PolicyActivityIpcDependencies): void {
  ipcMain.handle(IPC_CHANNELS.POLICY_GET, async () => {
    // null means "gateway unreachable". The UI keeps its last good policy
    // instead of editing an empty one (which would wipe the bootstrap rules).
    return gatewayFetchOr<PolicyDocument | null>('/api/policy', null)
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_UPDATE, async (_event, policy: PolicyDocument) => {
    await ensureGatewayRunning()
    return gatewayFetch<{ success: boolean; policy: PolicyDocument }>('/api/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    })
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_ADD_RULE, async (_event, rule: PolicyRule) => {
    await ensureGatewayRunning()
    // Server-side append: one atomic write instead of GET-then-PUT, which
    // could drop a concurrent rule change.
    await gatewayFetch('/api/policy/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    })
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.POLICY_REMOVE_RULE, async (_event, ruleId: string) => {
    await ensureGatewayRunning()
    await gatewayFetch(`/api/policy/rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    })
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_QUERY, async (_event, query: ActivityQuery) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    }
    return gatewayFetchOr<ActivityEntry[]>(`/api/activity?${params.toString()}`, [])
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_STATS, async () => {
    return gatewayFetchOr<ActivityStats>('/api/activity/stats', EMPTY_ACTIVITY_STATS)
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_PRUNE, async (_event, olderThanMs: number) => {
    await ensureGatewayRunning()
    return gatewayFetch<{ success: boolean; count: number }>('/api/activity/prune', {
      method: 'POST',
      body: JSON.stringify({ olderThanMs }),
    })
  })
}
