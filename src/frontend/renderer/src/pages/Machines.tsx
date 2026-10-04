import { useMemo, useState } from 'react'
import type { Machine, MachineStatus } from '@shared/types'
import { useNetworkData } from '../data/NetworkData'

/**
 * Fleet view. Machine rows merge the tailnet node list (`tailscale:devices`
 * → GET /api/tailscale/devices) with the gateway activity log, via the shared
 * NetworkData provider. Filter / search / sort / paging / export are local.
 */
const PAGE_SIZE = 5

type StatusFilter = 'all' | MachineStatus
type SortKey = 'name' | 'ip' | 'gatewayId' | 'status'

const filters: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All machines' },
  { id: 'connected', label: 'Connected' },
  { id: 'offline', label: 'Offline' },
  { id: 'denied', label: 'Denied' }
]

const sortCycle: SortKey[] = ['name', 'ip', 'gatewayId', 'status']
const sortLabel: Record<SortKey, string> = {
  name: 'machine name',
  ip: 'IP address',
  gatewayId: 'gateway id',
  status: 'status'
}

const statusLabel: Record<MachineStatus, string> = {
  connected: 'Connected',
  offline: 'Offline',
  denied: 'Denied'
}

const statusRank: Record<MachineStatus, number> = { connected: 0, denied: 1, offline: 2 }

function compareMachines(sortKey: SortKey, a: Machine, b: Machine): number {
  if (sortKey === 'status') return statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name)
  if (sortKey === 'ip') {
    if (a.ip === '—') return 1
    if (b.ip === '—') return -1
  }
  return a[sortKey].localeCompare(b[sortKey], undefined, { numeric: true })
}

function downloadCsv(rows: Machine[]): void {
  const header = ['Machine name', 'IP Address', 'Gateway Id', 'Status']
  const lines = [
    header,
    ...rows.map((row) => [row.name, row.ip, row.gatewayId, statusLabel[row.status]])
  ]
  const csv = lines
    .map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'machines.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function IconCpu(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="5" y="5" width="10" height="10" rx="2" />
      <path d="M8 2.5v2.5M12 2.5v2.5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" />
    </svg>
  )
}

function IconBolt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
      <path d="M11.2 1.5 4 11h5.2l-1 7.5L16 8.5h-5.2l.4-7z" />
    </svg>
  )
}

function IconAlert(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v4" strokeLinecap="round" />
      <circle cx="10" cy="13.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconShield(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M10 2.5 16 5v5.2c0 3.4-2.4 5.6-6 7.3-3.6-1.7-6-3.9-6-7.3V5l6-2.5z" />
      <path d="M10 7v3.5" strokeLinecap="round" />
    </svg>
  )
}

function IconDesktop(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="3" y="4" width="14" height="9" rx="1.5" />
      <path d="M8 16.5h4M10 13v3.5" strokeLinecap="round" />
    </svg>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
  hint
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: string
  hint?: { text: string; className: string }
}): React.JSX.Element {
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className={`rounded-lg p-2 ${tone}`}>{icon}</div>
        {hint && (
          <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${hint.className}`}>
            {hint.text}
          </span>
        )}
      </div>
      <div className="text-label text-ink uppercase">{label}</div>
      <div className="mt-1 text-h2 text-ink-heading tabular-nums">{value}</div>
    </div>
  )
}

function StatusCell({ status }: { status: MachineStatus }): React.JSX.Element {
  const dot =
    status === 'connected'
      ? 'bg-status-online status-glow-online motion-safe:animate-breathe'
      : status === 'denied'
        ? 'bg-status-blocked'
        : 'bg-status-offline'
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="text-body-small font-medium text-ink-emphasis">{statusLabel[status]}</span>
    </div>
  )
}

export default function Machines(): React.JSX.Element {
  const { machines, authFailures, status, error, refresh: refreshData } = useNetworkData()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [page, setPage] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // No data yet and no error → still waiting on the first poll.
  const loading = !status && machines.length === 0 && !error
  const connected = machines.filter((machine) => machine.status === 'connected').length
  const offline = machines.filter((machine) => machine.status === 'offline').length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return machines
      .filter((machine) => filter === 'all' || machine.status === filter)
      .filter((machine) => {
        if (!needle) return true
        return [machine.name, machine.subtitle, machine.ip, machine.gatewayId, statusLabel[machine.status]]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => compareMachines(sortKey, a, b))
  }, [machines, filter, query, sortKey])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const rangeStart = visible.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min(visible.length, (safePage + 1) * PAGE_SIZE)

  const refresh = (): void => {
    void refreshData()
  }

  const copyGatewayId = (machine: Machine): void => {
    if (machine.gatewayId === '—') return
    void navigator.clipboard.writeText(machine.gatewayId).then(() => {
      setCopiedId(machine.id)
      window.setTimeout(() => setCopiedId((current) => (current === machine.id ? null : current)), 1200)
    })
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-h4 text-brand-text uppercase">manager for</div>
          <h1 className="text-h1 text-ink-heading">Machines</h1>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => downloadCsv(visible)}
            disabled={visible.length === 0}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-button text-ink-emphasis hover:bg-surface-muted disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export
          </button>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-button text-primary-foreground hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Total machines"
          value={loading ? '—' : String(machines.length)}
          icon={<IconCpu />}
          tone="bg-brand/10 text-brand-text"
        />
        <StatCard
          label="Connected"
          value={loading ? '—' : String(connected)}
          icon={<IconBolt />}
          tone="bg-status-online/10 text-status-online"
          hint={
            status?.running
              ? { text: 'Active now', className: 'text-ink' }
              : undefined
          }
        />
        <StatCard
          label="Action required"
          value={loading ? '—' : String(offline)}
          icon={<IconAlert />}
          tone="bg-status-degraded/10 text-status-degraded"
          hint={
            offline > 0 ? { text: 'Priority', className: 'bg-status-degraded/10 text-status-degraded' } : undefined
          }
        />
        <StatCard
          label="Auth failures"
          value={loading ? '—' : String(authFailures)}
          icon={<IconShield />}
          tone="bg-status-blocked/10 text-status-blocked"
          hint={
            authFailures > 0 ? { text: 'Denied', className: 'text-status-blocked' } : undefined
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((item) => {
            const active = item.id === filter
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilter(item.id)
                  setPage(0)
                }}
                className={
                  active
                    ? 'rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-button text-brand-text'
                    : 'rounded-lg px-4 py-2 text-button text-ink hover:text-ink-emphasis'
                }
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search machines</span>
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="8.5" cy="8.5" r="5" />
              <path d="M12.5 12.5 17 17" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder="Search machines..."
              className="w-64 rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-body text-ink-emphasis outline-none placeholder:text-ink-muted focus:outline-2 focus:outline-ring"
            />
          </label>
          <button
            type="button"
            aria-label={`Sort by ${sortLabel[sortKey]}`}
            title={`Sort by ${sortLabel[sortKey]}`}
            onClick={() => {
              setSortKey((current) => sortCycle[(sortCycle.indexOf(current) + 1) % sortCycle.length])
              setPage(0)
            }}
            className="rounded-lg border border-border bg-surface-raised p-2 text-ink hover:bg-surface-muted hover:text-ink-emphasis"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M6 4v12M6 4 3.5 6.5M6 4l2.5 2.5M14 16V4M14 16l-2.5-2.5M14 16l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="glass-card overflow-x-auto rounded-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface-muted/40">
              <th className="px-6 py-4 text-h5 text-ink-muted uppercase">Machine name</th>
              <th className="px-6 py-4 text-h5 text-ink-muted uppercase">IP Address</th>
              <th className="px-6 py-4 text-h5 text-ink-muted uppercase">Gateway Id</th>
              <th className="px-6 py-4 text-h5 text-ink-muted uppercase">Status</th>
              <th className="px-4 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {error && machines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-body text-ink">
                  {error}. Start the gateway, then refresh.
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-body text-ink">
                  {loading ? 'Loading machines…' : 'No machines match this view.'}
                </td>
              </tr>
            ) : (
              pageRows.map((machine) => {
                const ipKnown = machine.ip !== '—'
                return (
                  <tr key={machine.id} className="group transition-colors hover:bg-surface-muted/40">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-surface-muted text-ink group-hover:bg-brand/15 group-hover:text-brand-text">
                          <IconDesktop />
                        </div>
                        <div>
                          <div className="max-w-[16rem] truncate text-h3 text-ink-heading group-hover:text-brand-text">
                            {machine.name}
                          </div>
                          <div className="mt-0.5 max-w-[16rem] truncate text-body-small text-ink">{machine.subtitle}</div>
                          <div className="mt-2">
                            <span className="rounded border border-brand/20 bg-brand/10 px-1.5 py-0.5 text-badge text-brand-text uppercase">
                              {machine.badge}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <code
                        className={`select-text rounded border px-2 py-1 font-mono text-code ${
                          ipKnown
                            ? 'border-brand-secondary/30 bg-brand-secondary/10 text-brand-secondary'
                            : 'border-border bg-surface-muted text-ink-muted'
                        }`}
                      >
                        {machine.ip}
                      </code>
                    </td>
                    <td className="px-6 py-5">
                      <code className="select-text font-mono text-code text-ink-emphasis">{machine.gatewayId}</code>
                    </td>
                    <td className="px-6 py-5">
                      <StatusCell status={machine.status} />
                    </td>
                    <td className="px-4 py-5 text-right">
                      <button
                        type="button"
                        aria-label={`Copy gateway id for ${machine.name}`}
                        title={copiedId === machine.id ? 'Copied' : 'Copy gateway id'}
                        onClick={() => copyGatewayId(machine)}
                        className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink-emphasis"
                      >
                        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                          <circle cx="10" cy="4.5" r="1.2" />
                          <circle cx="10" cy="10" r="1.2" />
                          <circle cx="10" cy="15.5" r="1.2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <p className="text-body-small text-ink">
            Showing {rangeStart} to {rangeEnd} of {visible.length} machines
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous page"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-body-small text-ink hover:bg-surface-muted disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-current={index === safePage ? 'page' : undefined}
                onClick={() => setPage(index)}
                className={
                  index === safePage
                    ? 'min-w-8 rounded-lg bg-brand px-2.5 py-1.5 text-body-small font-medium text-primary-foreground'
                    : 'min-w-8 rounded-lg border border-border px-2.5 py-1.5 text-body-small text-ink hover:bg-surface-muted'
                }
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              aria-label="Next page"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-body-small text-ink hover:bg-surface-muted disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
