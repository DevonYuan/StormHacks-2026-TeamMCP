import { useEffect, useLayoutEffect, useState } from 'react'
import Home from './pages/Home'
import Machines from './pages/Machines'
import Settings from './pages/Settings'
import { useNetworkData } from './data/NetworkData'
import { ConnectModal } from './components/ConnectModal'
import { ExposeModal } from './components/ExposeModal'

type Page = 'Network' | 'Machines' | 'Settings'
type Theme = 'light' | 'dark'

/** Light by default; the choice persists across launches. */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  )
  // Layout effect so the class is set before first paint — no light flash on a dark launch.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

// Fixed order, used for the ⌘1/⌘2/⌘3 shortcuts.
const PAGES: Page[] = ['Network', 'Machines', 'Settings']

const isMac = navigator.userAgent.includes('Mac')

function Icon({ page }: { page: Page }): React.JSX.Element {
  const common = {
    viewBox: '0 0 20 20',
    className: 'size-4.5 shrink-0',
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
  const [theme, toggleTheme] = useTheme()
  const running = status?.running ?? false
  const blocked = devices.filter((d) => d.status === 'blocked').length
  const online = devices.filter((d) => d.status === 'online').length

  const nav: { page: Page; badge?: { text: number; alert: boolean } }[] = [
    { page: 'Network', badge: blocked ? { text: blocked, alert: true } : undefined },
    { page: 'Machines', badge: devices.length ? { text: devices.length, alert: false } : undefined },
    { page: 'Settings' }
  ]

  return (
    <aside className="row-span-2 flex flex-col border-r border-border bg-surface-sidebar px-3 py-5">
      <div className="flex items-center gap-2 px-2">
        <img src="./logo.png" alt="Tether" className="h-10 w-auto" />
        {/* <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="ml-auto rounded-md p-1.5 text-ink hover:bg-surface-muted hover:text-ink-emphasis focus-visible:outline-2 focus-visible:outline-ring"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
          >
            {theme === 'dark' ? (
              <>
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1.1 1.1M14.6 14.6l1.1 1.1M4.3 15.7l1.1-1.1M14.6 5.4l1.1-1.1" />
              </>
            ) : (
              <path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z" />
            )}
          </svg>
        </button> */}
      </div>

      <nav className="mt-7 flex flex-col gap-0.5">
        {nav.map(({ page: p, badge }, i) => {
          const active = p === page
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-nav transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                active
                  ? 'sidebar-active'
                  : 'border-l-3 border-transparent text-ink hover:bg-surface-muted/50 hover:text-ink-emphasis'
              }`}
            >
              <span className={active ? 'text-brand-text' : ''}>
                <Icon page={p} />
              </span>
              {p}
              <kbd className="ml-auto font-mono text-caption text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
                {isMac ? '⌘' : 'Ctrl '}
                {i + 1}
              </kbd>
              {badge && (
                <span
                  className={`min-w-5 rounded-md px-1.5 text-center text-caption font-medium tabular-nums ${
                    badge.alert ? 'bg-status-blocked/12 text-status-blocked' : 'bg-surface-muted text-ink'
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
        <div className="text-overline text-ink-muted uppercase">Shared servers</div>
        <ul className="mt-2.5 flex flex-col gap-2">
          {servers.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 font-mono text-code">
              <span
                className={`size-1.5 shrink-0 rounded-full ${s.running ? 'bg-status-online' : 'bg-status-offline'}`}
              />
              <span className={`truncate ${s.running ? 'text-ink-emphasis' : 'text-ink'}`}>
                {s.name ?? s.id}
              </span>
              <span className="ml-auto shrink-0 text-caption text-ink-muted">{s.transport}</span>
            </li>
          ))}
          {servers.length === 0 && <li className="text-caption text-ink-muted">No servers registered</li>}
        </ul>
      </div>

      <div className="glass-card mt-auto rounded-xl p-3">
        <div className="flex items-center gap-2 text-body font-medium">
          <span
            className={`size-2 rounded-full ${running ? 'bg-status-online motion-safe:animate-breathe' : 'bg-status-offline'}`}
          />
          {running ? 'Gateway running' : 'Gateway paused'}
          <button
            onClick={() => void (running ? stopGateway() : startGateway())}
            aria-label={running ? 'Pause gateway' : 'Start gateway'}
            className={`ml-auto rounded-md p-1 ${running ? 'text-red-600/75 hover:bg-red-600/10 hover:text-red-600' : 'text-ink hover:bg-surface-muted hover:text-ink-emphasis'}`}
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
        <div className="mt-1.5 font-mono text-caption text-ink tabular-nums">
          {host.ip}:{host.port}
        </div>
        <div className="mt-2.5 flex gap-3 text-body-small text-ink">
          <span>
            <span className="font-medium text-ink-emphasis tabular-nums">{online}</span> online
          </span>
          <span>
            <span className="font-medium text-status-blocked tabular-nums">{blocked}</span> blocked
          </span>
        </div>
      </div>
    </aside>
  )
}

function StatusBar(): React.JSX.Element {
  const { host, servers, devices, tailscale, status } = useNetworkData()
  return (
    <footer className="flex h-statusbar items-center gap-5 border-t border-border bg-surface px-5 font-mono text-caption text-ink">
      <span className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${tailscale.available ? 'bg-status-online' : 'bg-status-offline'}`} />
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
        <span className="text-body-small text-ink">Share your local MCP servers with your team</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal('connect')}
            className="rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-body-small text-ink hover:text-ink-emphasis"
          >
            Connect to a peer
          </button>
          <button
            onClick={() => setModal('expose')}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-body-small font-medium text-primary-foreground hover:opacity-90"
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
    <div className="grid h-screen grid-cols-shell grid-rows-shell">
      <Sidebar page={page} onPage={setPage} />
      <main className="overflow-y-auto">
        <div className="mx-auto max-w-content px-6 py-6">
          <TopBar />
          {page === 'Network' ? (
            <Home />
          ) : page === 'Machines' ? (
            <Machines />
          ) : (
            <Settings />
          )}
        </div>
      </main>
      <StatusBar />
    </div>
  )
}

export default App
