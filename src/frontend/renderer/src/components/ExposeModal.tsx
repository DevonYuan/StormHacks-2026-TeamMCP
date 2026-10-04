import { useEffect, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { Modal } from './Modal'
import { useNetworkData } from '../data/NetworkData'

function Field({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink">
          {value}
        </code>
        <button
          onClick={() => {
            onCopy()
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/** Electron wraps IPC errors as "Error invoking remote method 'x': Error: msg". */
function message(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** "Open a connection": expose this gateway to the tailnet. */
export function ExposeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { available, status, servers, opening, expose, stopGateway, getShare } = useNetworkData()
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const running = status?.running ?? false

  useEffect(() => {
    if (!open || !available || !running) {
      setShare(null)
      return
    }
    let alive = true
    getShare()
      .then((s) => {
        if (alive) setShare(s)
      })
      .catch(() => {
        if (alive) setShare(null)
      })
    return () => {
      alive = false
    }
    // Re-read after a rebind. `running` alone stays true, so the old share kept
    // the Expose button on screen after the gateway had already moved off loopback.
  }, [open, available, running, status?.boundAddress, getShare])

  const exposeServers = async (): Promise<void> => {
    setError(null)
    try {
      await expose()
    } catch (e) {
      setError(message(e))
    }
  }

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }

  const address = share?.address ?? `${status?.boundAddress ?? '127.0.0.1'}:${status?.port ?? 8788}`
  const mcpUrl = share?.mcpUrl ?? `http://${address}/mcp`
  const bindAddress = status?.boundAddress || share?.bindAddress || ''
  const exposed = bindAddress !== '' && !['127.0.0.1', '::1', 'localhost'].includes(bindAddress)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open a connection"
      subtitle="Expose your local MCP servers so teammates on your tailnet can call them."
    >
      {!available ? (
        <p className="text-sm text-ink-muted">Open the desktop app to expose your servers.</p>
      ) : !running ? (
        opening ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink"
          >
            <span className="size-2 rounded-full bg-brand motion-safe:animate-pulse" />
            Opening gateway connection…
          </div>
        ) : (
          <button
            onClick={() => void exposeServers()}
            className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Expose servers
          </button>
        )
      ) : (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              exposed ? 'border-success/30 bg-success/5' : 'border-border bg-surface text-ink-muted'
            }`}
          >
            <span
              className={`size-2 rounded-full ${exposed ? 'bg-success motion-safe:animate-breathe' : 'bg-status-offline'}`}
            />
            {exposed ? 'Exposed to your tailnet' : 'Running locally only'}
          </div>

          {!exposed && (
            <button
              onClick={() => void exposeServers()}
              disabled={opening}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {opening ? 'Opening gateway connection…' : 'Expose to tailnet'}
            </button>
          )}

          <Field label="Address teammates connect to" value={address} onCopy={() => copy(address)} />
          <Field label="MCP endpoint" value={mcpUrl} onCopy={() => copy(mcpUrl)} />

          {!exposed && (
            <p className="text-xs text-ink-muted">
              {share?.tailscale.available
                ? 'The gateway is bound to loopback, so it is only reachable on this machine. Expose it to rebind to your tailnet interface.'
                : 'Tailscale isn’t available, so this is reachable only on this machine. Start Tailscale, then expose again.'}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-ink-muted">
            <span>
              {share?.connectedPeers ?? 0} client(s) · {servers.length} servers
            </span>
            <button
              onClick={() => void stopGateway()}
              className="rounded-lg border border-red-600/30 bg-red-600/5 px-2.5 py-1.5 text-red-600 transition hover:bg-red-600/10 hover:border-red-600/50 active:scale-95"
            >
              Stop gateway
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-status-blocked">{error}</p>}
    </Modal>
  )
}
