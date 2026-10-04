/**
 * Settings page: who may call the gateway (policy), which MCP servers it
 * shares, privacy of the activity log, and the listening port.
 *
 * Reads policy/servers/config straight from the bridge (the shared
 * NetworkData view models drop the fields this page edits) and re-reads after
 * every change. A failed read keeps the last good value, so a gateway restart
 * doesn't blank the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GatewayConfig } from '@shared/config'
import type { PolicyDocument, PolicyRule } from '@shared/policy'
import type { ServerConfig } from '@shared/protocol'
import type { Device } from '@shared/types'
import { useNetworkData } from '../data/NetworkData'

interface Snapshot {
  policy: PolicyDocument | null
  servers: ServerConfig[]
  config: GatewayConfig | null
}

const EMPTY: Snapshot = { policy: null, servers: [], config: null }
const DAY_MS = 24 * 60 * 60 * 1000

type Act = (fn: () => Promise<unknown>) => Promise<void>

async function load(prev: Snapshot): Promise<Snapshot> {
  const api = window.electronAPI
  if (!api) return EMPTY
  const [policy, servers, config] = await Promise.all([
    // `null` = gateway unreachable; keep the last good value instead of editing
    // an empty policy (which would wipe the bootstrap rules).
    api.policy.get().then((p) => p ?? prev.policy).catch(() => prev.policy),
    api.servers.getAll().then((s) => s ?? prev.servers).catch(() => prev.servers),
    api.config
      .get()
      .then((c) => c.gateway)
      .catch(() => prev.config),
  ])
  return { policy, servers, config }
}

/** Electron wraps IPC errors as "Error invoking remote method 'x': Error: msg". */
function message(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function newRule(user: string, serverId: string, effect: 'allow' | 'deny'): PolicyRule {
  return {
    id: `rule-${Date.now().toString(36)}`,
    name: `${effect === 'allow' ? 'Allow' : 'Deny'} ${user || 'everyone'}`,
    identities: user ? [{ user, device: '', deviceId: '', tailnet: '' }] : [],
    servers: serverId ? [serverId] : [],
    effect,
    // Deny outranks allow so a specific block beats a broad grant.
    priority: effect === 'deny' ? 60 : 50
  }
}

const inputClass =
  'rounded-lg border border-border bg-surface-raised px-3 py-2 text-body text-ink-emphasis outline-none placeholder:text-ink-muted focus:outline-2 focus:outline-ring disabled:opacity-50'
const primaryButton =
  'rounded-lg bg-brand px-4 py-2 text-button text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:active:scale-100'
const secondaryButton =
  'rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-body-small text-ink-emphasis transition hover:bg-surface-muted active:scale-95 disabled:opacity-40 disabled:active:scale-100'

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="glass-card rounded-xl p-6">
      <h2 className="text-h3 text-ink-heading">{title}</h2>
      {hint && <p className="mt-1 text-body-small text-ink">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Switch({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-brand' : 'bg-border-strong'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface-raised transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  )
}

function EffectBadge({ effect }: { effect: 'allow' | 'deny' }): React.JSX.Element {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-badge uppercase ${
        effect === 'allow'
          ? 'bg-status-online/10 text-status-online'
          : 'bg-status-blocked/10 text-status-blocked'
      }`}
    >
      {effect}
    </span>
  )
}

function Access({
  policy,
  servers,
  devices,
  busy,
  act
}: {
  policy: PolicyDocument
  servers: ServerConfig[]
  devices: Device[]
  busy: boolean
  act: Act
}): React.JSX.Element {
  const [user, setUser] = useState('')
  const [serverId, setServerId] = useState('')
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow')
  const api = window.electronAPI

  const serverName = (id: string): string => servers.find((s) => s.id === id)?.name ?? id
  const allowedUsers = new Set(
    policy.rules.filter((r) => r.effect === 'allow').flatMap((r) => r.identities?.map((i) => i.user) ?? [])
  )
  const pending = [
    ...new Set(
      devices
        .filter((d) => d.status === 'blocked' && d.user !== '—' && !allowedUsers.has(d.user))
        .map((d) => d.user)
    )
  ]
  const rules = [...policy.rules].sort((a, b) => b.priority - a.priority)

  const setDefault = (defaultEffect: 'allow' | 'deny'): Promise<void> =>
    act(() => api.policy.update({ ...policy, defaultEffect, updatedAt: Date.now(), updatedBy: 'ui' }))

  return (
    <Section
      title="Access"
      hint="Decide which teammates can call your shared servers. Rules are checked highest priority first."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body text-ink-emphasis">Teammates with no matching rule</div>
          <div className="text-caption text-ink">Deny is safer: only people you allow can call tools.</div>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['deny', 'allow'] as const).map((e) => (
            <button
              key={e}
              type="button"
              disabled={busy}
              aria-pressed={policy.defaultEffect === e}
              onClick={() => void setDefault(e)}
              className={`rounded-md px-3 py-1 text-body-small capitalize ${
                policy.defaultEffect === e ? 'bg-brand text-primary-foreground' : 'text-ink hover:text-ink-emphasis'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mt-5 rounded-lg border border-status-blocked/30 bg-status-blocked/5 p-4">
          <div className="text-h5 text-status-blocked uppercase">Blocked teammates</div>
          <ul className="mt-2 space-y-2">
            {pending.map((u) => (
              <li key={u} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-code text-ink-emphasis">{u}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => api.policy.addRule(newRule(u, '', 'allow')))}
                  className={secondaryButton}
                >
                  Allow
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 text-h5 text-ink-muted uppercase">Rules</div>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <EffectBadge effect={r.effect} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-ink-emphasis">
                {r.identities?.length ? r.identities.map((i) => i.user || i.device || '?').join(', ') : 'Everyone'}
              </div>
              <div className="truncate text-caption text-ink">
                {r.servers?.length ? r.servers.map(serverName).join(', ') : 'All servers'}
                {r.tools?.length ? ` · ${r.tools.length} tool(s)` : ''} · priority {r.priority}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove rule ${r.name}`}
              title="Remove rule"
              onClick={() => {
                if (window.confirm(`Remove rule "${r.name}"?`)) void act(() => api.policy.removeRule(r.id))
              }}
              className="rounded p-1 text-ink-muted hover:text-status-blocked disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="px-4 py-3 text-body-small text-ink">No rules yet.</li>}
      </ul>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void act(() => api.policy.addRule(newRule(user.trim(), serverId, effect))).then(() => setUser(''))
        }}
      >
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}
          aria-label="Effect"
          className={inputClass}
        >
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="alice@example.com (blank = everyone)"
          aria-label="Teammate login"
          className={`${inputClass} min-w-56 flex-1`}
        />
        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          aria-label="Server"
          className={inputClass}
        >
          <option value="">All servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy} className={primaryButton}>
          Add rule
        </button>
      </form>
    </Section>
  )
}

function Servers({
  servers,
  busy,
  act
}: {
  servers: ServerConfig[]
  busy: boolean
  act: Act
}): React.JSX.Element {
  const { servers: live } = useNetworkData()
  const [tools, setTools] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const api = window.electronAPI

  const running = (id: string): boolean => live.find((s) => s.id === id)?.running ?? false
  const canAdd = name.trim() && (transport === 'stdio' ? command.trim() : url.trim())

  const add = (): Promise<void> =>
    act(() =>
      api.servers.create({
        name: name.trim(),
        transport: transport as ServerConfig['transport'],
        ...(transport === 'stdio'
          ? {
              command: command.trim(),
              // One argument per line, so paths with spaces survive.
              args: args
                .split('\n')
                .map((a) => a.trim())
                .filter(Boolean)
            }
          : { url: url.trim() }),
        enabled: true
      })
    ).then(() => {
      setName('')
      setCommand('')
      setArgs('')
      setUrl('')
    })

  return (
    <Section title="Servers" hint="MCP servers this gateway shares. Teammates see their tools as server__tool.">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {servers.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`size-2 shrink-0 rounded-full ${running(s.id) ? 'bg-status-online' : 'bg-status-offline'}`}
              title={running(s.id) ? 'Running' : 'Not running'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-body text-ink-emphasis">{s.name}</span>
                <span className="text-caption text-ink-muted">{s.transport}</span>
                {tools[s.id] !== undefined && (
                  <span className="text-caption text-ink-muted">· {tools[s.id]} tools</span>
                )}
              </div>
              <div className="truncate font-mono text-code text-ink">
                {s.url ?? [s.command, ...(s.args ?? [])].filter(Boolean).join(' ')}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !s.enabled}
              onClick={() =>
                void act(async () => {
                  const result = await api.servers.refresh(s.id)
                  setTools((t) => ({ ...t, [s.id]: result.tools.length }))
                })
              }
              className={secondaryButton}
            >
              Refresh tools
            </button>
            <Switch
              checked={s.enabled}
              disabled={busy}
              label={`${s.enabled ? 'Disable' : 'Enable'} ${s.name}`}
              onChange={() => void act(() => api.servers.update(s.id, { enabled: !s.enabled }))}
            />
            <button
              type="button"
              disabled={busy}
              aria-label={`Delete ${s.name}`}
              title="Delete server"
              onClick={() => {
                if (window.confirm(`Delete server "${s.name}"? Teammates lose its tools.`))
                  void act(() => api.servers.delete(s.id))
              }}
              className="rounded p-1 text-ink-muted hover:text-status-blocked disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        ))}
        {servers.length === 0 && (
          <li className="px-4 py-3 text-body-small text-ink">No servers yet. Add one below.</li>
        )}
      </ul>

      <form
        className="mt-5 grid gap-3 rounded-lg border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canAdd) void add()
        }}
      >
        <div className="text-h5 text-ink-muted uppercase">Add a server</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. files"
            aria-label="Server name"
            className={`${inputClass} min-w-40 flex-1`}
          />
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as 'stdio' | 'streamable-http')}
            aria-label="Transport"
            className={inputClass}
          >
            <option value="stdio">Local command (stdio)</option>
            <option value="streamable-http">Remote URL (HTTP)</option>
          </select>
        </div>
        {transport === 'stdio' ? (
          <>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command, e.g. npx"
              aria-label="Command"
              className={`${inputClass} font-mono`}
            />
            <textarea
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              rows={3}
              placeholder={'Arguments, one per line\n-y\n@modelcontextprotocol/server-filesystem\n/home/me/shared'}
              aria-label="Arguments, one per line"
              className={`${inputClass} font-mono`}
            />
          </>
        ) : (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            aria-label="Server URL"
            className={`${inputClass} font-mono`}
          />
        )}
        <div>
          <button type="submit" disabled={busy || !canAdd} className={primaryButton}>
            Add server
          </button>
        </div>
      </form>
    </Section>
  )
}

function Privacy({
  config,
  busy,
  act,
  onNotice
}: {
  config: GatewayConfig
  busy: boolean
  act: Act
  onNotice: (text: string) => void
}): React.JSX.Element {
  const [days, setDays] = useState(30)
  const api = window.electronAPI
  const recording = !config.redactToolPayloads

  return (
    <Section title="Privacy & logs">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-body text-ink-emphasis">Record tool payloads</div>
          <div className="text-caption text-ink">
            Stores full requests and responses (file contents included) in the activity log. Restarts the gateway.
          </div>
        </div>
        <Switch
          checked={recording}
          disabled={busy}
          label="Record tool payloads"
          onChange={() => void act(() => api.config.update({ redactToolPayloads: recording }))}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
        <div>
          <div className="text-body text-ink-emphasis">Clear activity log</div>
          <div className="text-caption text-ink">Permanently deletes older entries.</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Delete entries older than"
            className={inputClass}
          >
            <option value={7}>Older than 7 days</option>
            <option value={30}>Older than 30 days</option>
            <option value={0}>Everything</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Delete these activity entries? This cannot be undone.')) return
              void act(async () => {
                const { count } = await api.activity.prune(Date.now() - days * DAY_MS)
                onNotice(`Deleted ${count} activity entr${count === 1 ? 'y' : 'ies'}.`)
              })
            }}
            className={secondaryButton}
          >
            Clear
          </button>
        </div>
      </div>
    </Section>
  )
}

function Network({
  config,
  busy,
  act
}: {
  config: GatewayConfig
  busy: boolean
  act: Act
}): React.JSX.Element {
  const { status, tailscale } = useNetworkData()
  const [port, setPort] = useState(String(config.port))
  const parsed = Number(port)
  const valid = Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535
  const address = `${status?.boundAddress ?? config.bindAddr}:${config.port}`

  const rows: [string, string][] = [
    ['Listening on', address],
    ['MCP endpoint', `http://${address}/mcp`],
    ['Tailscale', tailscale.available ? (tailscale.dnsName ?? tailscale.hostname ?? 'connected') : 'Not available']
  ]

  return (
    <Section title="Network" hint="Use “Open a connection” to expose the gateway on your tailnet.">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-body-small text-ink">{k}</dt>
            <dd className="truncate font-mono text-code text-ink-emphasis select-text">{v}</dd>
          </div>
        ))}
      </dl>

      <form
        className="mt-5 flex flex-wrap items-end gap-2 border-t border-border pt-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void act(() => window.electronAPI.config.update({ port: parsed }))
        }}
      >
        <label className="grid gap-1">
          <span className="text-body-small text-ink">Port</span>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
            className={`${inputClass} w-28 font-mono`}
          />
        </label>
        <button type="submit" disabled={busy || !valid || parsed === config.port} className={primaryButton}>
          Save & restart
        </button>
        <p className="w-full text-caption text-ink">
          {valid ? 'Teammates will need the new address after a change.' : 'Pick a port between 1024 and 65535.'}
        </p>
      </form>
    </Section>
  )
}

export default function Settings(): React.JSX.Element {
  const { available, devices } = useNetworkData()
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const snapRef = useRef(snap)
  snapRef.current = snap
  const reload = useCallback(() => load(snapRef.current).then(setSnap), [])

  useEffect(() => {
    void reload()
    const id = setInterval(() => void reload(), 5000)
    return () => clearInterval(id)
  }, [reload])

  const act: Act = async (fn) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    } finally {
      await reload()
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <div className="text-h4 text-brand-text uppercase">configure</div>
        <h1 className="text-h1 text-ink-heading">Settings</h1>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-status-blocked/30 bg-status-blocked/5 px-4 py-2 text-body-small text-status-blocked"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg border border-border bg-surface-muted px-4 py-2 text-body-small text-ink-emphasis">
          {notice}
        </p>
      )}

      {!available ? (
        <p className="text-body text-ink">Open the desktop app to change settings.</p>
      ) : (
        <div className="space-y-6">
          {snap.policy ? (
            <Access policy={snap.policy} servers={snap.servers} devices={devices} busy={busy} act={act} />
          ) : (
            <Section title="Access">
              <p className="text-body-small text-ink">Start the gateway to manage access and servers.</p>
            </Section>
          )}
          <Servers servers={snap.servers} busy={busy} act={act} />
          {snap.config && <Privacy config={snap.config} busy={busy} act={act} onNotice={setNotice} />}
          {snap.config && <Network key={snap.config.port} config={snap.config} busy={busy} act={act} />}
        </div>
      )}
    </div>
  )
}
