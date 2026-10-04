import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useNetworkData } from '../data/NetworkData'

/** "Connect to a teammate": register their exposed gateway as a peer. */
export function ConnectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const { available, servers, addPeer, probePeer, removePeer } = useNetworkData()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState<null | 'test' | 'connect'>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const peers = useMemo(() => servers.filter((s) => s.transport === 'streamable-http'), [servers])

  const run = async (mode: 'test' | 'connect'): Promise<void> => {
    setBusy(mode)
    setError(null)
    setOk(null)
    try {
      const result = mode === 'test' ? await probePeer(address) : await addPeer(address)
      setOk(
        mode === 'test'
          ? `Reachable — ${result.tools.length} tool(s) available`
          : `Connected — ${result.tools.length} tool(s) from ${result.url}`
      )
      if (mode === 'connect') setAddress('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect to a teammate"
      subtitle="Add a teammate's exposed gateway so their MCP tools appear in yours."
    >
      {!available ? (
        <p className="text-sm text-muted">Open the desktop app to connect to a peer.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium tracking-wide text-muted uppercase">
              Peer address
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void run('connect')
                }}
                placeholder="100.64.12.21:8788"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-[12px] text-ink outline-none focus-visible:border-signal"
              />
              <button
                onClick={() => void run('test')}
                disabled={!address.trim() || busy !== null}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-50"
              >
                {busy === 'test' ? 'Testing…' : 'Test'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              A tailnet address like <span className="font-mono">100.64.12.21:8788</span>, or a full URL.
            </p>
          </div>

          <button
            onClick={() => void run('connect')}
            disabled={!address.trim() || busy !== null}
            className="w-full rounded-lg bg-signal px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy === 'connect' ? 'Connecting…' : 'Connect'}
          </button>

          {error && <p className="text-xs text-signal">{error}</p>}
          {ok && <p className="text-xs text-online">{ok}</p>}

          {peers.length > 0 && (
            <div className="border-t border-line pt-3">
              <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                Connected peers
              </div>
              <ul className="mt-2 space-y-1.5">
                {peers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"
                  >
                    <span className={`size-1.5 rounded-full ${p.running ? 'bg-online' : 'bg-faint'}`} />
                    <span className="truncate font-mono">{p.name ?? p.id}</span>
                    <span className="ml-auto shrink-0 text-muted">{p.tools} tools</span>
                    <button
                      onClick={() => void removePeer(p.id)}
                      title="Remove peer"
                      aria-label={`Remove ${p.name ?? p.id}`}
                      className="rounded p-0.5 text-muted hover:text-signal"
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
