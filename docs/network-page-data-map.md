# Network page — data map (mock vs. real, Tailscale requirements)

Scope: the **Network** page (`src/frontend/renderer/src/pages/Home.tsx`) and the shell
(`src/frontend/renderer/src/App.tsx`) that surrounds it.

Owner: frontend · Last updated: 2026-10-03

Related: [`backend-api.md`](./backend-api.md), `docs/superpowers/specs/2026-10-03-frontend-scaffold-design.md`.

---

## Summary

- The Network page renders entirely from `src/frontend/renderer/src/mock.ts`, with **one real element**:
  **Host CPU / Memory** (`host:stats` IPC → main → `node:os`).
- The real plumbing already exists: the Electron main process auto-starts the gateway and proxies every
  backend call over IPC (`window.electronAPI`). The page simply does not consume it.
- The **device list** is the significant gap and the part that genuinely needs **Tailscale**.
- A few fields are **not measured by the backend at all** (per-server CPU/mem, client name, session start,
  latency percentiles, payload bytes).

**Two-layer mental model:**

| Layer | Question it answers | Source |
| --- | --- | --- |
| Tailscale | *Can this device reach the host, and who is it?* | `tailscale status` / `tailscale whois`, tailnet ACLs |
| Gateway | *Is this device allowed, and what did it call?* | policy engine, sessions, activity log |

A device's `blocked` status blends both: a known tailnet peer whose identity matches no policy rule
(or whose calls were denied).

---

## Element-by-element

### Shell — `App.tsx`

| Element | Now | Real source available? |
| --- | --- | --- |
| Nav badge — blocked count | Mock | `/api/activity` (`success=false`) or `/api/activity/stats` → `errorsByCode["403"]` |
| Nav badge — devices count | Mock | No endpoint (device gap) |
| Sidebar "Shared servers" list | Mock | `servers:get` (`/api/servers`) + `health:get` (`/api/health`) |
| Gateway running dot + start/stop toggle | UI-only `useState` | `gateway:getStatus` / `gateway:start` / `gateway:stop` |
| `host.ip:port` | Mock | `/api/tailscale` (ip) + `/api/status` (port) |
| Status bar: dns | Mock | `/api/tailscale` (`dnsName`) |
| Status bar: `N servers · M devices` | Mock | `/api/servers` + device list |
| Status bar: uptime | Mock | `/api/status` (`uptimeMs`) |

### Network page — `Home.tsx`

| Section / field | Now | Real source available? |
| --- | --- | --- |
| **Host CPU** | **REAL** | `host:stats` ✅ |
| **Host Memory** | **REAL** | `host:stats` ✅ |
| Stat: Calls / min | Mock | Derive from `/api/activity` timestamps |
| Stat: Latency p50 / p95 | Mock | Only `avgDurationMs` exists — p50/p95 computed over `/api/activity` |
| Stat: Denied · 24h | Mock | `/api/activity?success=false&since=…` (or stats `errorsByCode`) |
| Stat: Proxied today | Mock | Not measured (no payload byte size) |
| Tree: device nodes (name, user, ip, client) | Mock | Tailscale (`whois`) — `client` never captured |
| Tree: status online / offline / blocked | Mock | Tailscale `Peer.Online` (network) + activity/policy (app) |
| Tree: edges + live traffic dots | Mock | Derive from per-device activity rate |
| Device panel: latency, calls today, denied, traffic | Mock | `/api/activity` (per identity) |
| Device panel: access servers (`servers[]`) | Mock | `/api/policy` (rule matching) |
| Device panel: client, session since | Mock | ❌ client name + session start not captured |
| Servers table: server, transport, command | Mock | `/api/servers` (`transport` enum differs) |
| Servers table: running | Mock | `/api/health` (`status === 'healthy'`) |
| Servers table: tools count | Mock | `/api/servers/:id/refresh` (POST); no passive GET ⚠️ |
| Servers table: CPU / Memory | Mock | ❌ not measured |
| Activity log (time, user, `server__tool`, allowed/denied, ms) | Mock | `/api/activity` ✅ (maps 1:1) |

---

## Mock field → backend mapping

### `activity[]`
| Mock field | Backend |
| --- | --- |
| `id` | `ActivityEntry.id` |
| `at` | `ActivityEntry.timestamp` (format `HH:MM:SS`) |
| `deviceId` | `identity.deviceId` / `identity.device` / `identity.user` |
| `tool` | `` `${serverId}__${toolName}` `` |
| `outcome` | `success ? 'allowed' : 'denied'` |
| `ms` | `ActivityEntry.durationMs` |

### `servers[]`
| Mock field | Backend |
| --- | --- |
| `id` | `ServerConfig.id` (name displayed separately) |
| `transport` | `ServerConfig.transport` (`stdio` \| `streamable-http` \| `sse`) |
| `command` | `command` + `args` joined (or `url`) |
| `running` | `ServerHealth.status === 'healthy'` |
| `tools` | distinct `toolName`s observed in activity (approx.) |
| `callsPerMin` | activity count for `serverId` in the last 60s |
| `cpu`, `memMb` | ❌ unavailable → render `—` |

### `devices[]` (derived from activity + policy)
| Mock field | Backend / derivation |
| --- | --- |
| `id` | `identity.deviceId` or `identity.user` |
| `name` | `identity.device` (Tailscale `HostName` once Phase 2 lands) |
| `user` | `identity.user` (Tailscale `LoginName`) |
| `ip` | ❌ not in activity → Tailscale `TailscaleIPs` (Phase 2) |
| `client` | ❌ MCP `clientInfo` not captured |
| `status` | policy deny → `blocked`; recent activity → `online`; else `offline` |
| `lastSeen` | last activity `timestamp` for the identity |
| `since` | ❌ session start not exposed |
| `latencyMs` | mean `durationMs` for the identity |
| `callsToday` | activity count for the identity since local midnight |
| `servers` | policy rule resolution for the identity |
| `traffic` | 30 × 1-minute buckets of activity counts |

---

## Backend gaps (not exposed yet)

1. **Tailnet device list** — nothing returns peers. Add `GET /api/tailscale/devices` wrapping
   `getTailscaleStatus()` (Self + Peer → HostName, DNSName, TailscaleIPs, Online, LastSeen, Tags).
2. **`/api/tailscale/whois` is unimplemented** — main's `tailscale:whois` IPC calls it, but the gateway's
   `case 'tailscale'` matches any `/api/tailscale/*` and returns *local* info, so whois silently returns
   the wrong shape.
3. **MCP client name/version** — `initialize` `clientInfo` is never stored per session.
4. **Session start time** (`since`) — sessions are in-memory in the proxy and not exposed.
5. **Per-server CPU / memory** — the gateway never samples child-process resources.
6. **Latency percentiles** — only `avgDurationMs` exists.
7. **Proxied bytes/day** — not measured.
8. **Device IP in activity** — `ActivityEntry` stores identity, not the remote IP.
9. **Passive tool counts** — only returned by the `refresh` POST action.
10. **Real-time events** — preload exposes `event:activity`, `event:serverHealth`, `event:toolsChanged`,
    but main never emits them (only `gateway:log`, `gateway:status`). Live updates need polling for now.

---

## 🔴 Requires Tailscale

1. **Enumerating devices (tree nodes).** `tailscale status --json` is the only source of peers that have
   never called the gateway. Without it, only activity-known clients can be shown.
2. **Device identity** (`user@tailnet`, machine name) — `tailscale whois <ip>` (`resolveIdentityFromIp`).
3. **Host tailnet IP + MagicDNS name** (`host.ip`, `host.dns`) — `tailscale status` Self. Returns
   `available:false` when Tailscale is down → the UI must degrade to a "local-only" mode.
4. **Network-level online / `LastSeen`** — `Peer.Online` / `LastSeen`. Distinct from "has a gateway session".
5. **Remote reachability — binding + ACLs.** The gateway defaults to `bindAddr: 127.0.0.1` (loopback only);
   teammates can only connect if it binds the tailnet interface, and **Tailscale ACLs** govern who may
   reach the port (network layer, separate from gateway policy).

---

## Phasing

- **Phase 1 — no Tailscale:** consume `gateway:status`, `servers:get`, `health:get`, `activity:query`,
  `activity:stats`, `policy:get`, `tailscale:status`. Build the device list from **activity identities**
  (device/user/lastSeen/callsToday/latency/traffic/access). Render `—` for unmeasured fields. Degrade
  gracefully when Tailscale is unavailable.
- **Phase 2 — Tailscale:** add `GET /api/tailscale/devices` + implement `/api/tailscale/whois`; enrich
  nodes with tailnet name/IP/online/LastSeen; host card from Self; bind the tailnet interface.
- **Phase 3 — live + measurements:** emit `event:activity` / `event:serverHealth` from main; capture MCP
  `clientInfo`, session start, per-server tools, latency percentiles, payload bytes.
