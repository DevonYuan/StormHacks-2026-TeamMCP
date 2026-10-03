import { useEffect, useState } from 'react'
import type { Device, DeviceStatus, HostStats } from '@shared/types'
import { activity, devices, gateway, host, servers } from '../mock'

// Tree geometry lives in one viewBox; HTML cards are placed by percentage of it,
// so edges and cards stay aligned at any width.
const W = 800
const ROW = 92
const H = Math.max(320, devices.length * ROW + 16)
const HOST_X = 24
const HOST_W = 220
const DEV_X = 492
const DEV_W = 284
const PORT_L = HOST_X + HOST_W
const BEND = (DEV_X - PORT_L) / 2
const yHost = H / 2
const yDevice = (i: number): number => H / 2 + (i - (devices.length - 1) / 2) * ROW
const edge = (y: number): string =>
  `M ${PORT_L} ${yHost} C ${PORT_L + BEND} ${yHost}, ${DEV_X - BEND} ${y}, ${DEV_X} ${y}`
const pctX = (x: number): string => `${(x / W) * 100}%`
const pctY = (y: number): string => `${(y / H) * 100}%`

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)

const dot: Record<DeviceStatus, string> = {
  online: 'bg-online',
  offline: 'bg-faint',
  blocked: 'bg-signal'
}

const stroke: Record<DeviceStatus, { className: string; dash?: string; width: number }> = {
  online: { className: 'stroke-online', width: 1.75 },
  offline: { className: 'stroke-faint', dash: '6 6', width: 1.5 },
  blocked: { className: 'stroke-signal', dash: '0.5 7', width: 2.25 }
}

const denied = (d: Device): number =>
  activity.filter((e) => e.deviceId === d.id && e.outcome === 'denied').length
const rate = (d: Device): number => d.traffic.at(-1) ?? 0

function statusLine(d: Device): string {
  if (d.status === 'online') return `Online via ${d.client}. Last call at ${d.lastSeen}.`
  if (d.status === 'offline') return `Offline. Last seen ${d.lastSeen}.`
  return `Blocked. ${denied(d)} denied attempts, last at ${d.lastSeen}.`
}

/** Polls real host CPU/memory from the main process; null outside Electron. */
function useHostStats(): { stats: HostStats | null; history: number[] } {
  const [stats, setStats] = useState<HostStats | null>(null)
  const [history, setHistory] = useState<number[]>([])
  useEffect(() => {
    const host = window.electronAPI?.host
    if (!host) return
    const tick = (): void => {
      host.stats().then((s) => {
        setStats(s)
        setHistory((h) => [...h.slice(-39), s.cpu])
      })
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [])
  return { stats, history }
}

function Spark({
  values,
  max,
  className = 'h-8'
}: {
  values: number[]
  max?: number
  className?: string
}): React.JSX.Element {
  const top = max ?? Math.max(...values, 1)
  const idle = values.every((v) => v === 0)
  const pts =
    values.length < 2
      ? '0,40 100,40'
      : values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - (v / top) * 36}`).join(' ')
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      aria-hidden
    >
      {!idle && <polygon points={`0,40 ${pts} 100,40`} className="fill-online/10" />}
      <polyline
        points={pts}
        fill="none"
        className={idle ? 'stroke-faint' : 'stroke-online'}
        strokeWidth="1.5"
        strokeDasharray={idle ? '3 3' : undefined}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
  children
}: {
  label: string
  value: string
  sub: string
  tone?: 'signal'
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col px-4 py-3">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${tone === 'signal' ? 'text-signal' : ''}`}
      >
        {value}
      </div>
      <div className="truncate text-xs text-muted tabular-nums">{sub}</div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

function StatStrip(): React.JSX.Element {
  const { stats, history } = useHostStats()
  const callsNow = devices.reduce((n, d) => n + rate(d), 0)
  const callsToday = devices.reduce((n, d) => n + d.callsToday, 0)
  const memPct = stats ? (stats.memUsed / stats.memTotal) * 100 : 0

  return (
    <div className="mt-5 grid grid-cols-6 divide-x divide-line rounded-xl border border-line bg-card">
      <Stat
        label="Host CPU"
        value={stats ? `${stats.cpu.toFixed(1)}%` : '—'}
        sub={stats ? `${stats.cores} cores · load ${stats.load.toFixed(2)}` : 'unavailable'}
      >
        <Spark values={history} max={100} className="h-6" />
      </Stat>
      <Stat
        label="Memory"
        value={stats ? `${gb(stats.memUsed)} GB` : '—'}
        sub={stats ? `of ${gb(stats.memTotal)} GB · ${memPct.toFixed(0)}%` : 'unavailable'}
      >
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-online" style={{ width: `${memPct}%` }} />
        </div>
      </Stat>
      <Stat label="Calls / min" value={String(callsNow)} sub={`${callsToday} today`} />
      <Stat label="Latency p50" value={`${gateway.p50} ms`} sub={`p95 ${gateway.p95} ms`} />
      <Stat
        label="Denied · 24h"
        value={String(gateway.denied24h)}
        sub={`${devices.filter((d) => d.status === 'blocked').length} unknown device`}
        tone="signal"
      />
      <Stat label="Proxied" value={gateway.proxiedToday} sub="today" />
    </div>
  )
}

function Tree({
  focus,
  onFocus
}: {
  focus: Device
  onFocus: (d: Device) => void
}): React.JSX.Element {
  // Focused edge is drawn last so it sits on top.
  const order = devices.map((d, i) => ({ d, y: yDevice(i) }))
  order.sort((a, b) => Number(a.d === focus) - Number(b.d === focus))
  const fy = (yHost + yDevice(devices.indexOf(focus))) / 2
  const label =
    focus.status === 'online'
      ? `${rate(focus)} calls/min`
      : focus.status === 'blocked'
        ? `${denied(focus)} denied`
        : null

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      aria-label="Network tree of devices connected to this host"
      role="group"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
        {order.map(({ d, y }) => {
          const s = stroke[d.status]
          const path = edge(y)
          const dur = Math.max(1.4, 5 - rate(d) / 4)
          return (
            <g
              key={d.id}
              className={`transition-opacity duration-300 ${d === focus ? '' : 'opacity-25'}`}
            >
              <path
                d={path}
                fill="none"
                className={s.className}
                strokeWidth={d === focus ? s.width + 0.5 : s.width}
                strokeDasharray={s.dash}
                strokeLinecap="round"
              />
              {d.status === 'online' &&
                !reducedMotion &&
                [0, dur / 2].map((offset) => (
                  <circle key={offset} r="3" className="fill-signal">
                    {/* Requests travel from the teammate's device into the host. */}
                    <animateMotion
                      path={path}
                      dur={`${dur}s`}
                      begin={`-${offset}s`}
                      repeatCount="indefinite"
                      keyPoints="1;0"
                      keyTimes="0;1"
                      calcMode="linear"
                    />
                  </circle>
                ))}
              <circle
                cx={DEV_X}
                cy={y}
                r="3"
                className={`fill-card ${s.className}`}
                strokeWidth="1.5"
              />
            </g>
          )
        })}
        <circle cx={PORT_L} cy={yHost} r="3.5" className="fill-ink" />
      </svg>

      <div
        className="absolute -translate-y-1/2 rounded-xl bg-ink px-4 py-3 text-white shadow-[0_12px_32px_-12px_rgb(17_17_17/0.5)]"
        style={{ left: pctX(HOST_X), top: pctY(yHost), width: pctX(HOST_W) }}
      >
        <div className="truncate text-[15px] font-semibold">{host.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-white/60">host · {host.ip}</div>
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-white/50">
          <span className="size-1.5 rounded-full bg-signal" />
          {host.sharedServers} servers shared
        </div>
      </div>

      {label && (
        <span
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium tabular-nums ${
            focus.status === 'blocked' ? 'border-signal/30 text-signal' : 'border-line text-online'
          }`}
          style={{ left: pctX(PORT_L + BEND), top: pctY(fy) }}
        >
          {label}
        </span>
      )}

      {devices.map((d, i) => {
        const focused = d === focus
        const ring =
          d.status === 'blocked' ? 'border-signal ring-signal' : 'border-online ring-online'
        return (
          <button
            key={d.id}
            onClick={() => onFocus(d)}
            aria-pressed={focused}
            className={`absolute -translate-y-1/2 rounded-xl border bg-card px-3.5 py-2.5 text-left transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
              focused
                ? `${ring} ring-1 shadow-[0_10px_28px_-14px_rgb(17_17_17/0.35)]`
                : 'border-line opacity-55 hover:opacity-100'
            } ${d.status === 'blocked' && !focused ? 'border-dashed' : ''}`}
            style={{ left: pctX(DEV_X), top: pctY(yDevice(i)), width: pctX(DEV_W) }}
          >
            <div className="flex items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${dot[d.status]}`} />
              <span className="truncate text-sm font-medium">{d.name}</span>
              <span
                className={`ml-auto shrink-0 text-[11px] tabular-nums ${d.status === 'blocked' ? 'text-signal' : 'text-muted'}`}
              >
                {d.status === 'online' ? `${rate(d)}/min` : d.status}
              </span>
            </div>
            <div className="mt-0.5 truncate pl-4 font-mono text-[11px] text-muted">
              {d.user} · {d.ip}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Legend(): React.JSX.Element {
  const items: [string, DeviceStatus][] = [
    ['Online', 'online'],
    ['Offline', 'offline'],
    ['Blocked attempt', 'blocked']
  ]
  return (
    <ul className="flex gap-5 text-xs text-muted">
      {items.map(([text, status]) => (
        <li key={status} className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line
              x1="2"
              y1="3"
              x2="20"
              y2="3"
              className={stroke[status].className}
              strokeWidth="2"
              strokeDasharray={stroke[status].dash}
              strokeLinecap="round"
            />
          </svg>
          {text}
        </li>
      ))}
    </ul>
  )
}

const pill: Record<DeviceStatus, string> = {
  online: 'bg-online/10 text-online',
  offline: 'bg-black/[0.05] text-muted',
  blocked: 'bg-signal/12 text-signal'
}

function DevicePanel({ device: d }: { device: Device }): React.JSX.Element {
  const live = d.status === 'online'
  const cells: [string, string][] = [
    ['Calls / min', live ? String(rate(d)) : '—'],
    ['Latency', live ? `${d.latencyMs} ms` : '—'],
    ['Calls today', String(d.callsToday)],
    ['Denied', String(denied(d))]
  ]
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-card p-5">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${dot[d.status]}`} />
        <h2 className="truncate font-semibold">{d.name}</h2>
        <span
          className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${pill[d.status]}`}
        >
          {d.status}
        </span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted">
        {d.user} · {d.ip}
      </div>
      <p className="mt-2 text-sm text-muted">{statusLine(d)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {cells.map(([k, v]) => (
          <div key={k} className="bg-card px-3 py-2">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd
              className={`text-lg font-semibold tabular-nums ${k === 'Denied' && v !== '0' ? 'text-signal' : ''}`}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-baseline justify-between text-[11px] text-muted">
        <span>Traffic</span>
        <span>last 30 min</span>
      </div>
      <Spark values={d.traffic} className="mt-1 h-12" />

      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        {(
          [
            ['Client', d.client],
            ['Session since', d.since],
            ['Last seen', d.lastSeen]
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="truncate tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Access</dt>
          <dd className="flex flex-wrap justify-end gap-1">
            {d.servers.length ? (
              d.servers.map((s) => (
                <span
                  key={s}
                  className="rounded border border-line px-1.5 font-mono text-[11px] text-ink"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-signal">not in policy</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function Servers(): React.JSX.Element {
  const running = servers.filter((s) => s.running).length
  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <h2 className="font-semibold">Shared servers</h2>
        <span className="text-xs text-muted">
          {running} of {servers.length} running
        </span>
      </div>
      <table className="mt-2 w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
            <th className="px-5 py-2 font-medium">Server</th>
            <th className="w-14 px-3 py-2 text-right font-medium">Tools</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Calls/min</th>
            <th className="w-16 px-3 py-2 text-right font-medium">CPU</th>
            <th className="w-20 px-5 py-2 text-right font-medium">Memory</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {servers.map((s) => (
            <tr key={s.id} className={s.running ? '' : 'text-muted'}>
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${s.running ? 'bg-online' : 'bg-faint'}`}
                  />
                  <span className="font-mono text-[13px] font-medium">{s.id}</span>
                  <span className="text-[11px] text-faint">
                    {s.running ? s.transport : 'stopped'}
                  </span>
                </div>
                <div
                  className="mt-0.5 truncate pl-3.5 font-mono text-[11px] text-faint"
                  title={s.command}
                >
                  {s.command}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{s.tools}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {s.running ? s.callsPerMin : '—'}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {s.running ? `${s.cpu.toFixed(1)}%` : '—'}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums">
                {s.running ? `${s.memMb} MB` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Activity({ focus }: { focus: Device }): React.JSX.Element {
  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <h2 className="font-semibold">Activity</h2>
        <span className="text-xs text-muted">all devices</span>
      </div>
      <ul className="mt-2 divide-y divide-line border-t border-line">
        {activity.slice(0, 8).map((e) => {
          const [server, tool] = e.tool.split('__')
          const mine = e.deviceId === focus.id
          return (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2 text-[13px]">
              <span className="w-14 shrink-0 text-muted tabular-nums">{e.at}</span>
              <span className={`w-14 shrink-0 truncate ${mine ? 'font-medium' : 'text-muted'}`}>
                {e.deviceId}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={e.tool}>
                <span className="text-muted">{server}__</span>
                {tool}
              </span>
              {e.outcome === 'allowed' ? (
                <span className="shrink-0 text-xs text-muted tabular-nums">{e.ms} ms</span>
              ) : (
                <span className="shrink-0 rounded-md bg-signal/10 px-1.5 py-0.5 text-[11px] font-medium text-signal">
                  denied
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function Home(): React.JSX.Element {
  const [focus, setFocus] = useState<Device>(
    () => devices.find((d) => d.status === 'online') ?? devices[0]
  )
  const online = devices.filter((d) => d.status === 'online').length

  return (
    <>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Who&apos;s connected</h1>
          <p className="mt-1 text-sm text-muted">
            Your laptop at the root, each teammate&apos;s device as a branch. Select one to inspect
            it.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-online motion-safe:animate-breathe" />
          Live · updates every 2s
        </div>
      </div>

      <StatStrip />

      <div className="mt-4 grid grid-cols-12 gap-4">
        <div className="col-span-8 flex flex-col overflow-hidden rounded-xl border border-line bg-card">
          <div
            className="flex flex-1 items-center"
            style={{
              backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          >
            <Tree focus={focus} onFocus={setFocus} />
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <span className="text-xs text-muted">
              {devices.length} devices · {online} online
            </span>
            <Legend />
          </div>
        </div>
        <div className="col-span-4">
          <DevicePanel device={focus} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-12 gap-4">
        <div className="col-span-6">
          <Servers />
        </div>
        <div className="col-span-6">
          <Activity focus={focus} />
        </div>
      </div>
    </>
  )
}
