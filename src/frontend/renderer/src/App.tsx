import { useEffect, useState } from 'react'
import Home from './pages/Home'
import { useNetworkData } from './data/NetworkData'
import { ConnectModal } from './components/ConnectModal'
import { ExposeModal } from './components/ExposeModal'

type Page = 'Network' | 'Machines' | 'Settings'

// Fixed order, used for the ⌘1/⌘2/⌘3 shortcuts.
const PAGES: Page[] = ['Network', 'Machines', 'Settings']

const isMac = navigator.userAgent.includes('Mac')

function Icon({ page }: { page: Page }): React.JSX.Element {
  const common = {
    viewBox: '0 0 20 20',
    className: 'size-[18px] shrink-0',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    'aria-hidden': true
  }
  if (page === 'Network')
    return (
      <svg {...common}>
        <circle cx="4" cy="10" r="2" />
        <circle cx="16" cy="4.5" r="2" />
        <circle cx="16" cy="15.5" r="2" />
        <path d="M6 10c4 0 4-5.5 8-5.5M6 10c4 0 4 5.5 8 5.5" />
      </svg>
    )
  if (page === 'Machines')
    return (
      <svg {...common}>
        <rect x="3.5" y="4" width="13" height="9" rx="1.5" />
        <path d="M1.5 16h17" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </svg>
  )
}

function Sidebar({ page, onPage }: { page: Page; onPage: (p: Page) => void }): React.JSX.Element {
  const { devices, servers, host, status, startGateway, stopGateway } = useNetworkData()
  const running = status?.running ?? false
  const blocked = devices.filter((d) => d.status === 'blocked').length
  const online = devices.filter((d) => d.status === 'online').length

  const nav: { page: Page; badge?: { text: number; alert: boolean } }[] = [
    { page: 'Network', badge: blocked ? { text: blocked, alert: true } : undefined },
    { page: 'Machines', badge: devices.length ? { text: devices.length, alert: false } : undefined },
    { page: 'Settings' }
  ]

  return (
    <aside className="row-span-2 flex flex-col border-r border-line bg-rail px-3 py-5">
      <img src="./logo.png" alt="Tether" className="mx-2 h-10 w-auto self-start" />

      <nav className="mt-7 flex flex-col gap-0.5">
        {nav.map(({ page: p, badge }, i) => {
          const active = p === page
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-signal ${
                active
                  ? 'border-line bg-card font-medium text-ink shadow-[0_1px_2px_rgb(17_17_17/0.05)]'
                  : 'border-transparent text-muted hover:bg-black/[0.035] hover:text-ink'
              }`}
            >
              <span className={active ? 'text-signal' : ''}>
                <Icon page={p} />
              </span>
              {p}
              <kbd className="ml-auto font-mono text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                {isMac ? '⌘' : 'Ctrl '}
                {i + 1}
              </kbd>
              {badge && (
                <span
                  className={`min-w-5 rounded-md px-1.5 text-center text-[11px] font-medium tabular-nums ${
                    badge.alert ? 'bg-signal/12 text-signal' : 'bg-black/[0.05] text-muted'
                  }`}
                  title={badge.alert ? `${badge.text} blocked attempt(s)` : undefined}
                >
                  {badge.text}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-8 px-2.5">
        <div className="text-[11px] font-medium tracking-wide text-faint uppercase">
          Shared servers
        </div>
        <ul className="mt-2.5 flex flex-col gap-2">
          {servers.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 font-mono text-[12.5px]">
              <span className={`size-1.5 shrink-0 rounded-full ${s.running ? 'bg-online' : 'bg-faint'}`} />
              <span className={`truncate ${s.running ? 'text-ink' : 'text-muted'}`}>
                {s.name ?? s.id}
              </span>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{s.transport}</span>
            </li>
          ))}
          {servers.length === 0 && <li className="text-[11px] text-faint">No servers registered</li>}
        </ul>
      </div>

      <div className="mt-auto rounded-xl border border-line bg-card p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={`size-2 rounded-full ${running ? 'bg-online motion-safe:animate-breathe' : 'bg-faint'}`}
          />
          {running ? 'Gateway running' : 'Gateway paused'}
          <button
            onClick={() => void (running ? stopGateway() : startGateway())}
            aria-label={running ? 'Pause gateway' : 'Start gateway'}
            className="ml-auto rounded-md p-1 text-muted hover:bg-black/[0.05] hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
              {running ? (
                <path d="M4 3h2.5v10H4zM9.5 3H12v10H9.5z" />
              ) : (
                <path d="M4.5 2.5v11L13 8z" />
              )}
            </svg>
          </button>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-muted tabular-nums">
          {host.ip}:{host.port}
        </div>
        <div className="mt-2.5 flex gap-3 text-xs text-muted">
          <span>
            <span className="font-medium text-ink tabular-nums">{online}</span> online
          </span>
          <span>
            <span className="font-medium text-signal tabular-nums">{blocked}</span> blocked
          </span>
        </div>
      </div>
    </aside>
  )
}

function StatusBar(): React.JSX.Element {
  const { host, servers, devices, tailscale, status } = useNetworkData()
  return (
    <footer className="flex h-8 items-center gap-5 border-t border-line bg-surface px-5 font-mono text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${tailscale.available ? 'bg-online' : 'bg-faint'}`} />
        {tailscale.available ? 'tailnet' : 'local only'}
      </span>
      <span>{host.dns}</span>
      <span>
        {servers.length} servers · {devices.length} devices
      </span>
      <span>uptime {status?.running ? host.uptime : '—'}</span>
      <span className="ml-auto">v0.1.0</span>
    </footer>
  )
}

function TopBar(): React.JSX.Element {
  const [modal, setModal] = useState<'expose' | 'connect' | null>(null)
  const { status, tailscale } = useNetworkData()
  const running = status?.running ?? false
  const exposed = running && tailscale.available && status?.boundAddress === tailscale.ip

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Share your local MCP servers with your team</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal('connect')}
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-muted hover:text-ink"
          >
            Connect to a peer
          </button>
          <button
            onClick={() => setModal('expose')}
            className="flex items-center gap-1.5 rounded-lg bg-signal px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
              <path d="M4.5 2.5v11L13 8z" />
            </svg>
            {running ? (exposed ? 'Open · exposed' : 'Open · local') : 'Open a connection'}
          </button>
        </div>
      </div>
      <ExposeModal open={modal === 'expose'} onClose={() => setModal(null)} />
      <ConnectModal open={modal === 'connect'} onClose={() => setModal(null)} />
    </>
  )
}

function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('Network')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = PAGES[Number(e.key) - 1]
      if ((e.metaKey || e.ctrlKey) && target) {
        e.preventDefault()
        setPage(target)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="grid h-screen grid-cols-[236px_1fr] grid-rows-[1fr_auto]">
      <Sidebar page={page} onPage={setPage} />
      <main className="overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-6">
          <TopBar />
          {page === 'Network' ? <Home /> : <p className="text-muted">{page} is coming next.</p>}
        </div>
      </main>
      <StatusBar />
    </div>
  )
}

export default App
