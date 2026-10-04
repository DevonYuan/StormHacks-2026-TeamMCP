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

/** "Open a connection": expose this gateway to the tailnet. */
export function ExposeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { available, status, servers, expose, stopGateway, getShare } = useNetworkData()
  const [busy, setBusy] = useState(false)
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
  }, [open, available, running, getShare])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await expose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  }

  const address = share?.address ?? `${status?.boundAddress ?? '127.0.0.1'}:${status?.port ?? 8788}`
  const mcpUrl = share?.mcpUrl ?? `http://${address}/mcp`
  const exposed = Boolean(share && !share.localOnly)

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
        <button
          onClick={() => void start()}
          disabled={busy}
          className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Expose servers'}
        </button>
      ) : (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              exposed ? 'border-status-online/30 bg-status-online/5' : 'border-border bg-surface text-ink-muted'
            }`}
          >
            <span
              className={`size-2 rounded-full ${exposed ? 'bg-status-online motion-safe:animate-breathe' : 'bg-status-offline'}`}
            />
            {exposed ? 'Exposed to your tailnet' : 'Running locally only'}
          </div>

          {!exposed && (
            <button
              onClick={() => void start()}
              disabled={busy}
              className="w-full rounded-lg bg-signal px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Exposing…' : 'Expose to tailnet'}
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
