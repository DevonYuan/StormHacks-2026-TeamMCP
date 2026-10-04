/**
 * Onboarding deck — a minimal slide walkthrough distilled from docs/Onboarding.md.
 *
 * Shows once on first launch (gated by a localStorage flag) and can be replayed
 * any time: dispatch `window` event `tether:show-onboarding` (the Settings page
 * has a button for this). Self-contained — App just renders it once, no props.
 */

import { useCallback, useEffect, useState } from 'react'

const SEEN_KEY = 'tether.onboarded'
export const SHOW_EVENT = 'tether:show-onboarding'

/** Fire from anywhere (e.g. Settings) to replay the deck. */
export function showOnboarding(): void {
  window.dispatchEvent(new Event(SHOW_EVENT))
}

type Icon = (p: { className?: string }) => React.JSX.Element

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const IconShare: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6" />
  </svg>
)
const IconCheck: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
)
const IconNet: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </svg>
)
const IconServer: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <rect x="4" y="4" width="16" height="7" rx="1.5" />
    <rect x="4" y="13" width="16" height="7" rx="1.5" />
    <path d="M7.5 7.5h.01M7.5 16.5h.01" />
  </svg>
)
const IconPlug: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <path d="M9 3v4M15 3v4M7 7h10v3a5 5 0 0 1-10 0zM12 15v6" />
  </svg>
)
const IconBolt: Icon = ({ className }) => (
  <svg {...common} className={className}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
)

interface Slide {
  eyebrow: string
  title: string
  Icon: Icon
  body: React.ReactNode
}

const kbd = 'rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-ink-emphasis'

const SLIDES: Slide[] = [
  {
    eyebrow: 'Welcome',
    title: 'Share your MCP servers with the team',
    Icon: IconShare,
    body: (
      <>
        <p>
          Tether exposes MCP servers running on one machine to the rest of your team —
          securely, over Tailscale, with nothing redeployed to the cloud.
        </p>
        <p className="mt-3">Every connection has two roles:</p>
        <ul className="mt-2 space-y-1.5">
          <li>
            <span className="font-medium text-ink-emphasis">Host</span> — runs the local servers and exposes a gateway.
          </li>
          <li>
            <span className="font-medium text-ink-emphasis">Client</span> — connects to that gateway and uses the tools from their coding agent.
          </li>
        </ul>
      </>
    ),
  },
  {
    eyebrow: 'Before you start',
    title: 'What you need',
    Icon: IconCheck,
    body: (
      <>
        <p>Both people need:</p>
        <ul className="mt-2 space-y-1.5">
          <li>The Tether app installed.</li>
          <li>A Tailscale account, joined to the same tailnet.</li>
          <li>An internet connection.</li>
        </ul>
        <p className="mt-3">
          The <span className="font-medium text-ink-emphasis">client</span> also needs VS Code with GitHub Copilot (Agent mode).
        </p>
      </>
    ),
  },
  {
    eyebrow: 'Step 1',
    title: 'Get on the same tailnet',
    Icon: IconNet,
    body: (
      <>
        <p>Tether rides on Tailscale, so both devices must share a tailnet first.</p>
        <ul className="mt-2 space-y-1.5">
          <li>Host installs Tailscale, logs in, and invites the client by email.</li>
          <li>Client accepts the invite and logs in on their device.</li>
          <li>
            Confirm the path with <code className={kbd}>tailscale ping &lt;host-ip&gt;</code>.
          </li>
        </ul>
      </>
    ),
  },
  {
    eyebrow: 'Step 2 · Host',
    title: 'Add a server, then expose it',
    Icon: IconServer,
    body: (
      <>
        <ul className="space-y-1.5">
          <li>
            In <span className="font-medium text-ink-emphasis">Settings → Servers</span>, add an MCP server (a local
            command or a remote URL).
          </li>
          <li>
            Open a connection and click <span className="font-medium text-ink-emphasis">Expose to tailnet</span>.
          </li>
          <li>Share the two values it shows — the Address and the MCP endpoint — with your client.</li>
        </ul>
        <p className="mt-3 text-caption text-ink-muted">Keep the host awake and Tether running during the session.</p>
      </>
    ),
  },
  {
    eyebrow: 'Step 3 · Client',
    title: 'Connect and point your agent at it',
    Icon: IconPlug,
    body: (
      <>
        <ul className="space-y-1.5">
          <li>
            In Tether, open <span className="font-medium text-ink-emphasis">Connect to a teammate</span> and enter the Address.
          </li>
          <li>
            Add the MCP endpoint to <code className={kbd}>.vscode/mcp.json</code> as an{' '}
            <code className={kbd}>http</code> server.
          </li>
          <li>
            Run <span className="font-medium text-ink-emphasis">MCP: List Servers → Start</span> in VS Code.
          </li>
        </ul>
      </>
    ),
  },
  {
    eyebrow: "You're set",
    title: 'Run a tool across the tailnet',
    Icon: IconBolt,
    body: (
      <>
        <p>
          Switch Copilot Chat to <span className="font-medium text-ink-emphasis">Agent</span> mode, prompt it to use the
          tether tools, and approve the call.
        </p>
        <p className="mt-3">
          The request travels Copilot → Tether → the host's server and back. Watch it land live on the host's{' '}
          <span className="font-medium text-ink-emphasis">Activity</span> page.
        </p>
        <p className="mt-3 text-caption text-ink-muted">Full details live in docs/Onboarding.md.</p>
      </>
    ),
  },
]

export function Onboarding(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  // First-run: open unless the flag is set. localStorage can throw in some
  // contexts, so never let it block rendering the app.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true)
    } catch {
      /* ignore */
    }
    const show = (): void => {
      setI(0)
      setOpen(true)
    }
    window.addEventListener(SHOW_EVENT, show)
    return () => window.removeEventListener(SHOW_EVENT, show)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const last = i === SLIDES.length - 1
  const next = useCallback(() => (last ? close() : setI((n) => n + 1)), [last, close])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, next, back])

  if (!open) return null
  const slide = SLIDES[i]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tether onboarding"
    >
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={close} />

      <div className="relative flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-8 shadow-[0_24px_60px_-24px_rgb(17_17_17/0.45)]">
        <button
          onClick={close}
          aria-label="Skip onboarding"
          className="absolute right-4 top-4 rounded-md p-1 text-ink-muted hover:bg-surface-muted hover:text-ink-emphasis"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>

        {/* key forces a fresh fade-in on each slide */}
        <div key={i} className="motion-safe:animate-[onb-fade_.25s_ease]">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand-text">
            <slide.Icon className="size-6" />
          </span>
          <div className="mt-5 text-h5 uppercase text-brand-text">{slide.eyebrow}</div>
          <h2 className="mt-1 text-h2 text-ink-heading">{slide.title}</h2>
          <div className="mt-4 space-y-1 text-body text-ink [&_ul]:list-disc [&_ul]:pl-5">{slide.body}</div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex gap-1.5" aria-hidden>
            {SLIDES.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${
                  n === i ? 'w-5 bg-brand' : 'w-1.5 bg-border-strong'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={back}
                className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-body-small text-ink-emphasis transition hover:bg-surface-muted active:scale-95"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-brand px-4 py-1.5 text-button text-primary-foreground transition hover:opacity-90 active:scale-95"
            >
              {last ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
