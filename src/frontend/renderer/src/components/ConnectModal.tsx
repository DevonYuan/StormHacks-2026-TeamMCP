import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useNetworkData } from '../data/NetworkData'
import { useAuth } from '../auth/AuthContext'

/** "Connect to a teammate": register their exposed gateway as a peer. */
export function ConnectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { available, servers, addPeer, probePeer, removePeer } = useNetworkData()
  const { mode } = useAuth()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState<null | 'test' | 'connect'>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'idle' | 'success' | 'error'>('idle')

  // Only a live session is listed. The gateway does not persist a peer until the
  // handshake succeeds, so a failure never appears here.
  const peers = useMemo(
    () => servers.filter((s) => s.transport === 'streamable-http' && s.running),
    [servers]
  )

  const run = async (action: 'test' | 'connect'): Promise<void> => {
    setBusy(action)
    setError(null)
    setOk(null)
    setOutcome('idle')
    try {
      if (action === 'test') {
        const probed = await probePeer(address)
        setOutcome('success')
        setOk(`Reachable — ${probed.tools.length} tool(s) available`)
        return
      }
      // addPeer connects first and only then registers the peer.
      const result = await addPeer(address)
      setOutcome('success')
      setOk(`Connected — ${result.tools.length} tool(s) from ${result.url}`)
    } catch (e) {
      setOutcome('error')
      const message = e instanceof Error ? e.message : String(e)
      setError(/waiting for host approval/i.test(message)
        ? 'Access request sent. Ask the gateway host to approve your Tailscale user in Settings, then retry.'
        : message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect to a teammate"
      subtitle={mode === 'client'
        ? 'Connect to any host on your tailnet. Each host controls access separately and may require approval.'
        : "Add a teammate's exposed gateway so their MCP tools appear in yours."}
    >
      {!available ? (
        <p className="text-sm text-ink-muted">Open the desktop app to connect to a peer.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
              Peer address
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    setOutcome('idle')
                    setError(null)
                    setOk(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void run('connect')
                  }}
                  placeholder="100.64.12.21:8788"
                  aria-invalid={outcome === 'error'}
                  className={`w-full rounded-lg border px-2.5 py-2 pr-8 font-mono text-[12px] text-ink outline-none ${
                    outcome === 'success'
                      ? 'border-success bg-success/15 focus-visible:border-success'
                      : outcome === 'error'
                        ? 'border-status-blocked bg-status-blocked/10 focus-visible:border-status-blocked'
                        : 'border-border bg-surface focus-visible:border-brand'
                  }`}
                />
                {outcome === 'success' && (
                  <span
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-success"
                    aria-label="Connection successful"
                  >
                    ✓
                  </span>
                )}
                {outcome === 'error' && (
                  <span
                    className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-status-blocked"
                    aria-label="Connection failed"
                  >
                    ✕
                  </span>
                )}
              </div>
              <button
                onClick={() => void run('test')}
                disabled={!address.trim() || busy !== null}
                className="rounded-lg border border-border px-3 py-2 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
              >
                {busy === 'test' ? 'Testing…' : 'Test'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              A tailnet address like <span className="font-mono">100.64.12.21:8788</span>, or a full URL.
            </p>
          </div>

          <button
            onClick={() => void run('connect')}
            disabled={!address.trim() || busy !== null}
            className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy === 'connect' ? 'Testing connection…' : 'Connect'}
          </button>

          {error && <p className="text-xs text-status-blocked">{error}</p>}
          {ok && <p className="text-xs text-success">{ok}</p>}

          {peers.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                Connected peers
              </div>
              <ul className="mt-2 space-y-1.5">
                {peers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                  >
                    <span className="size-1.5 rounded-full bg-success" />
                    <span className="truncate font-mono">{p.name ?? p.id}</span>
                    <span className="ml-auto shrink-0 text-ink-muted">{p.tools} tools</span>
                    <button
                      onClick={() => {
                        void removePeer(p.id).catch((e: unknown) => {
                          setOutcome('error')
                          setError(e instanceof Error ? e.message : String(e))
                        })
                      }}
                      title="Remove peer"
                      aria-label={`Remove ${p.name ?? p.id}`}
                      className="rounded p-0.5 text-ink-muted hover:text-status-blocked"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
