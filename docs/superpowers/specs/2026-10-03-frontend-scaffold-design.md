# Frontend scaffold + three pages — design

Owner: Mahesh (scaffolding + frontend) · Date: 2026-10-03

## Goal

A runnable Electron app (per README §3/§5) with three pages — **Home**, **Dashboard**, **Settings** — driven by typed mock data, so the UI can be built and demoed before the gateway/tRPC layer exists. Swapping mock → real data later touches only the data module, not components.

## Stack (this phase)

- `electron-vite` React + TypeScript template → `src/main`, `src/preload`, `src/renderer`.
- Tailwind CSS v4 (`@tailwindcss/vite`). Native HTML elements (`<table>`, `<input>`, `<details>`, checkbox/switch) styled with Tailwind.
- **Deferred** (README lists them; added when first needed): shadcn/ui (when we need a dialog/dropdown), Recharts (when a real chart outgrows an SVG sparkline), Zustand + TanStack Query (when real async data arrives), tRPC (when the gateway exposes procedures).
- Navigation: `useState` tab switch. No router — Electron has no URLs worth deep-linking.

## Visual language

"Harmonious, unique, professional, sleek." Calm, warm-neutral surfaces with one ink color and one signal color.

- Surface `#f7f6f3` (warm off-white), cards `#ffffff`, hairlines `#e7e5e0`.
- Ink `#111111` (host node, headings), muted text `#6b6a66`.
- Online edges/indicators: slate-indigo `#3f4a6b`.
- Signal accent (logo orange) `#e8692c`: blocked attempts, live traffic packets, focus rings.
- System font stack; `tabular-nums` for IPs, times, counts.
- Generous whitespace, 1px hairlines instead of heavy borders, no drop shadows except the focused node.

## Shell

Header: logo mark + "Team MCP Gateway"; right side a status line — `● Gateway on · N devices online`. Below, a tab bar (underline on active tab, like the Tailscale reference): **Home · Dashboard · Settings**.

## Home — network tree ("Who's connected")

Matches the reference mockup.

- **Host node** (left, solid ink card): `Devon's MacBook · Host · 100.64.12.8`.
- **Device nodes** (right column, evenly spaced): name, `user@tailnet`, status dot.
- **Edges**: cubic Bézier from host to each device, drawn in one SVG.
  - Online → solid slate line. Offline → dashed grey. Blocked attempt (identity not in policy) → dotted orange.
  - Live traffic: a small orange dot travels along online edges (`<animateMotion>`, native SVG — no animation lib). Respects `prefers-reduced-motion`.
- **Focus**: clicking a device (a real `<button>`, keyboard-reachable) highlights its edge + card and dims the others; default focus = most recently active device.
- **Legend** under the tree: Online / Offline / Blocked attempt.
- **Detail strip** for the focused device: `name · user · IP` and status line ("Online. Last call at 14:32.").
- **Below the tree** (the "graphs / logging" ask):
  - Calls-per-minute sparkline (inline SVG polyline, last 30 min) for the focused device.
  - Recent activity log: time · user · `server__tool` · allowed/denied badge.

Layout: a container with fixed `aspect-ratio`; the SVG uses the same `viewBox`, and HTML node cards are absolutely positioned by percentage, so edges and cards stay aligned at any width.

## Dashboard — machines & users

Modelled on the Tailscale "Machines" screenshot.

- Title "Machines", search input (filters by name/user/tag), `N machines` pill.
- Table columns: **Machine** (name, `user@tailnet`, tag badges e.g. `Host`, `Claude Desktop`, `Blocked`), **Address** (tailnet IP), **Client** (MCP client + version), **Last seen** (green dot "Connected" or timestamp), trailing `…` (no-op for now).

## Settings

Three sections on one scrolling page:

1. **Access controls** — matrix: rows = users, columns = registered servers, checkbox = allowed. Local state only.
2. **Gateway configuration** — port, bind address, log level (read-only display of defaults from README), "Redact tool payloads" toggle (default on).
3. **Registered servers** — list (name, transport, command/URL, status) with remove; "Add server" inline form (name + command/URL). Local state only.

## Data

- `src/shared/types.ts`: `Device`, `Server`, `ActivityEvent`, `Policy` (user → allowed server ids).
- `src/renderer/src/mock.ts`: one host, 4 devices (2 online, 1 offline, 1 blocked/unknown), 3 servers (filesystem, git, playwright), ~15 activity events, a calls-per-minute series.

## Files

```
src/renderer/src/
  App.tsx            shell + tab state
  mock.ts
  pages/Home.tsx     network tree + sparkline + activity log
  pages/Dashboard.tsx
  pages/Settings.tsx
  index.css          tailwind import + theme tokens
src/shared/types.ts
```

## Out of scope

Real IPC/tRPC, gateway process, persistence, tool-level policy editing, dark mode, packaging.

## Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev` launches; all three tabs render; clicking a device on Home focuses it; search filters Dashboard; Settings toggles update.
- No unit tests this phase — views are static over mock data. Tests arrive with real logic (policy, routing).
