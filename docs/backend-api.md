# Team MCP Gateway — Backend API Reference

This document describes all HTTP endpoints exposed by the gateway data plane (`src/backend/gateway/index.ts`). The gateway runs on a configurable port (default `8788`) and binds to `127.0.0.1` by default.

---

## Base URL

```
http://127.0.0.1:8788
```

All endpoints return JSON. Error responses follow this shape:

```json
{
  "error": "Human-readable message",
  "issues": [...]        // Only for validation errors (400)
}
```

---

## Core Endpoints

### `GET /health`

Liveness probe. Does **not** reflect MCP server connectivity.

**Response (200):**

```json
{
  "status": "ok",
  "running": true,
  "startedAt": 1727890000000,
  "uptimeMs": 123456,
  "boundAddress": "127.0.0.1",
  "port": 8788,
  "connectedPeers": 2,
  "totalRequests": 42,
  "activeSessions": 0
}
```

---

### `POST /mcp`  &  `POST /mcp/...`

**MCP Streamable HTTP endpoint** — the single unified entry point for all MCP protocol traffic (`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, notifications). All session management is handled internally by the proxy.

> **Note:** This is the only endpoint MCP clients (Claude Desktop, custom agents, etc.) should use. The gateway authenticates the request via the `Authorization: Bearer <token>` header, evaluates policy, forwards to the appropriate upstream MCP server(s), and returns the aggregated/namespaced result.

**Request:** Standard MCP JSON-RPC 2.0 over HTTP (see [MCP Spec](https://modelcontextprotocol.io/specification/2025-06-18)).

**Authentication:** `Authorization: Bearer <Ed25519 token>` (obtained via `/auth/token`).

**Response:** MCP JSON-RPC 2.0 response or SSE stream.

---

### `POST /auth/token`

Exchange a client IP (or Tailscale identity) for a signed Ed25519 session token.

**Request:**

```json
{
  "clientIp": "127.0.0.1"   // optional, defaults to 127.0.0.1
}
```

**Response (200):**

```json
{
  "success": true,
  "identity": {
    "user": "local@dev",
    "device": "dev-machine",
    "deviceId": "abc123",
    "tailnet": "example.ts.net"
  },
  "token": "eyJhbGciOiJFZERTQSJ9..."
}
```

**Response (500):** `{ "success": false, "error": "..." }` — token signing failed.

---

### `GET /policy`

Returns the current authorization policy document.

**Response (200):**

```json
{
  "version": 1,
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "bootstrap-local",
      "name": "Bootstrap: local development",
      "identities": [{ "user": "local@dev", "device": "", "deviceId": "", "tailnet": "" }],
      "effect": "allow",
      "priority": 100,
      "description": "Allows the local loopback identity full access."
    }
  ],
  "updatedAt": 1727890000000,
  "updatedBy": "system"
}
```

---

### `PUT /policy`

Replace the entire policy document. Validates against `PolicyDocumentSchema`.

**Request:** Full `PolicyDocument` (same shape as GET response). `updatedAt` is overwritten with current timestamp.

**Response (200):**

```json
{
  "success": true,
  "policy": { ... }
}
```

**Response (400):** Validation error (malformed policy).

---

## `/api` — Administrative REST API

All `/api/*` endpoints are administrative and do **not** require the MCP Bearer token (they run in the Electron main process context). They are intended for the frontend settings UI.

---

### `GET /api/status`

Extended gateway status including bound address/port.

**Response (200):**

```json
{
  "running": true,
  "startedAt": 1727890000000,
  "uptimeMs": 123456,
  "boundAddress": "127.0.0.1",
  "port": 8788,
  "connectedPeers": 2,
  "totalRequests": 42,
  "activeSessions": 0
}
```

---

### `GET /api/servers`

List all registered MCP server configurations.

**Response (200):**

```json
[
  {
    "id": "fs-local",
    "name": "Local Filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/abs/path/to/data"],
    "env": {},
    "cwd": "/abs/path/to/project",
    "enabled": true,
    "description": "Filesystem access for mcptesting/data",
    "createdAt": 1727890000000,
    "updatedAt": 1727890000000
  }
]
```

---

### `POST /api/servers`

Register a new MCP server. `id`, `createdAt`, `updatedAt` are generated server-side.

**Request:**

```json
{
  "name": "My Server",
  "transport": "stdio",              // "stdio" | "streamable-http" | "sse"
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": {},
  "cwd": "/optional/working/dir",
  "enabled": true,
  "description": "Optional description"
}
```

**Response (201):** Created `ServerConfig` (includes generated `id`, timestamps).

**Response (400):** Validation error (e.g., missing `name`, invalid `transport`).

---

### `GET /api/servers/:id`

Get a single server configuration.

**Response (200):** `ServerConfig`

**Response (404):** `{ "error": "Server not found: <id>" }`

---

### `PUT /api/servers/:id`

Update a server configuration (partial). If `enabled` toggles, the gateway connects/disconnects automatically.

**Request:** Partial `ServerConfig` (omit `id`, `createdAt`, `updatedAt`).

**Response (200):** Updated `ServerConfig`

**Response (404):** Not found

**Response (400):** Validation error

---

### `DELETE /api/servers/:id`

Delete a server configuration and disconnect if currently connected.

**Response (200):** `{ "success": true }`

**Response (404):** Not found

---

### `POST /api/servers/:id/connect`

Explicitly connect to a registered server.

**Response (200):** `{ "success": true }`

---

### `POST /api/servers/:id/disconnect`

Explicitly disconnect from a registered server.

**Response (200):** `{ "success": true }`

---

### `POST /api/servers/:id/refresh`

Refresh capabilities (re-run `tools/list` on the upstream server).

**Response (200):**

```json
{
  "success": true,
  "tools": [
    { "name": "fs-local__read_text_file", "description": "...", "inputSchema": {...} },
    ...
  ]
}
```

---

### `GET /api/policy`

Alias for `GET /policy` (kept for API symmetry).

---

### `PUT /api/policy`

Alias for `PUT /policy`.

---

### `GET /api/activity`

Query the activity log with filters and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max entries to return |
| `offset` | number | 0 | Pagination offset |
| `since` | number (ms) | — | Filter entries after timestamp |
| `until` | number (ms) | — | Filter entries before timestamp |
| `identity` | string | — | Exact match on `identity.user@tailnet` |
| `deviceId` | string | — | Exact match on `identity.deviceId` |
| `serverId` | string | — | Exact match |
| `toolName` | string | — | Exact match (namespaced) |
| `method` | string | — | e.g. `tools/call` |
| `success` | boolean | — | `true` or `false` |
| `sortBy` | string | `timestamp` | `timestamp` or `duration_ms` |
| `sortOrder` | string | `desc` | `asc` or `desc` |

**Response (200):**

```json
[
  {
    "id": "evt_abc123",
    "timestamp": 1727890123456,
    "identity": { "user": "local@dev", "device": "dev", "deviceId": "abc", "tailnet": "ts.net" },
    "method": "tools/call",
    "serverId": "fs-local",
    "toolName": "fs-local__read_text_file",
    "requestSummary": "read_text_file({\"path\":\"/data/foo.txt\"})",
    "responseSummary": "OK (42 bytes)",
    "success": true,
    "durationMs": 12,
    "requestPayload": { ... },      // only if !redactToolPayloads
    "responsePayload": { ... }
  }
]
```

---

### `GET /api/activity/stats`

Aggregated statistics over the activity log.

**Query Parameters:**

| Param | Type | Default |
|-------|------|---------|
| `since` | number (ms) | — |

**Response (200):**

```json
{
  "totalRequests": 150,
  "successfulRequests": 142,
  "failedRequests": 8,
  "uniqueUsers": 1,
  "uniqueServers": 2,
  "avgDurationMs": 15.3,
  "byMethod": { "tools/call": 120, "tools/list": 15, "initialize": 10, "resources/list": 5 },
  "byServer": { "fs-local": 100, "git-local": 50 },
  "byTool": { "fs-local__read_text_file": 60, "fs-local__list_directory": 40 },
  "byIdentity": { "local@dev": 150 },
  "errorsByCode": { "403": 5, "500": 3 }
}
```

---

### `POST /api/activity/prune`

Delete activity entries older than a timestamp.

**Request:**

```json
{
  "olderThanMs": 1725298800000    // optional, defaults to 30 days ago
}
```

**Response (200):**

```json
{ "success": true, "count": 42 }
```

---

### `GET /api/health`

Health status for **each registered MCP server**. Uses `resolveHealthStatus`:
- `healthy` — connected and last check succeeded
- `degraded` — connected but recent failures
- `unhealthy` — connected but consecutive failures exceeded threshold
- `unknown` — not currently connected (no stale data leaked)

**Response (200):**

```json
[
  {
    "serverId": "fs-local",
    "status": "healthy",
    "lastCheck": 1727890123456,
    "latencyMs": 4,
    "error": undefined,
    "consecutiveFailures": 0
  },
  {
    "serverId": "git-local",
    "status": "unknown",
    "lastCheck": 1727890000000,
    "latencyMs": undefined,
    "error": undefined,
    "consecutiveFailures": 0
  }
]
```

---

### `GET /api/tailscale`

Check if Tailscale CLI (`tailscale`) is available and return local node info.

**Response (200):**

```json
{
  "available": true,
  "ip": "100.x.y.z",
  "hostname": "dev-machine",
  "dnsName": "dev-machine.example.ts.net"
}
```

If unavailable:

```json
{ "available": false, "ip": null, "hostname": null, "dnsName": null }
```

---

## Types Reference

### `ServerConfig` (from `src/backend/shared/protocol.ts`)

```ts
interface ServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'streamable-http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled: boolean
  description?: string
  createdAt: number
  updatedAt: number
}
```

### `PolicyDocument` (from `src/backend/shared/policy.ts`)

```ts
interface PolicyDocument {
  version: 1
  defaultEffect: 'allow' | 'deny'
  rules: PolicyRule[]
  updatedAt: number
  updatedBy: string
}

interface PolicyRule {
  id: string
  name: string
  identities?: Identity[]     // empty = match all authenticated
  servers?: string[]          // server IDs, empty = all
  tools?: string[]            // namespaced tool names, empty = all
  effect: 'allow' | 'deny'
  priority: number            // higher wins
  description?: string
}

interface Identity {
  user: string        // e.g. "alice@example.com"
  device: string      // e.g. "alice-laptop"
  deviceId: string    // Tailscale stable device ID
  tailnet: string     // e.g. "example.ts.net"
}
```

### `ActivityEntry` (from `src/backend/shared/activity.ts`)

```ts
interface ActivityEntry {
  id: string
  timestamp: number
  identity: Identity
  method: string
  serverId: string
  toolName?: string
  requestSummary: string
  responseSummary: string
  success: boolean
  errorCode?: number
  errorMessage?: string
  durationMs: number
  requestPayload?: unknown
  responsePayload?: unknown
}
```

### `ServerHealth` (from `src/backend/shared/activity.ts`)

```ts
type ServerHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

interface ServerHealth {
  serverId: string
  status: ServerHealthStatus
  lastCheck?: number
  latencyMs?: number
  error?: string
  consecutiveFailures: number
}
```

### `GatewayStatus` (from `src/backend/shared/activity.ts`)

```ts
interface GatewayStatus {
  running: boolean
  startedAt?: number
  uptimeMs: number
  boundAddress: string
  port: number
  connectedPeers: number
  totalRequests: number
  activeSessions: number
}
```

---

## Authentication & Authorization Flow

1. **Client obtains token** → `POST /auth/token` → receives Ed25519 JWT.
2. **Client calls MCP** → `POST /mcp` with `Authorization: Bearer <token>`.
3. **Gateway validates token** → extracts `Identity` + `permissions` (scoped servers/tools).
4. **PolicyEngine evaluates** → `defaultEffect` + ordered rules → `allow` / `deny`.
5. **If allowed** → request forwarded to upstream MCP server(s), response logged to activity.
6. **If denied** → `403` error returned, activity logged with `success: false`, `errorCode: 403`.

---

## Namespaced Tool Names

When multiple upstream servers expose tools with the same name, the gateway prefixes each with `<serverId>__`:

```
Upstream tool:  read_text_file
Gateway tool:   fs-local__read_text_file
```

Clients **must** use the namespaced name in `tools/call`. The proxy strips the prefix before forwarding.

---

## Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `Validation failed` | Zod schema validation error (includes `issues`) |
| 400 | `Malformed JSON body` | Request body is not valid JSON |
| 403 | `Access denied` | Policy evaluation denied the request |
| 404 | `Not Found` | Unknown endpoint or server ID |
| 405 | `Method Not Allowed` | HTTP method not supported for that path |
| 500 | *varies* | Internal server error (token signing, DB, upstream crash) |

---

## Running the Gateway

```bash
# From repo root
npx tsx src/backend/gateway/index.ts --port 8788 --bind 127.0.0.1 --db gateway.db --log-level debug
```

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | 8788 | HTTP listen port |
| `GATEWAY_BIND_ADDR` | 127.0.0.1 | Bind address |
| `GATEWAY_DB_PATH` | gateway.db | SQLite file path |
| `TAILSCALE_CLI` | `tailscale` | Path to tailscale binary |
| `REDACT_TOOL_PAYLOADS` | true | Omit payloads from activity log |
| `LOG_LEVEL` | info | pino log level |

---

## Related Files

| File | Purpose |
|------|---------|
| `src/backend/gateway/index.ts` | Main HTTP server + all route handlers |
| `src/backend/gateway/mcp/server.ts` | MCP proxy (Streamable HTTP, policy, activity) |
| `src/backend/gateway/mcp/client.ts` | Upstream MCP client manager (stdio/HTTP/SSE) |
| `src/backend/gateway/auth/auth.ts` | Ed25519 token issuance + Tailscale integration |
| `src/backend/gateway/authz/policy.ts` | PolicyEngine (rule evaluation) |
| `src/backend/gateway/db/repository.ts` | SQLite repositories (servers, policy, health, activity) |
| `src/backend/shared/protocol.ts` | Zod schemas for MCP + ServerConfig |
| `src/backend/shared/policy.ts` | Policy types + default policy factory |
| `src/backend/shared/activity.ts` | Activity/health/status types |
| `src/backend/shared/config.ts` | GatewayConfig + env parsing |
| `src/backend/gateway/health.ts` | `resolveHealthStatus` helper |

---

*Generated from source on 2026-10-03. Keep this doc in sync with `src/backend/gateway/index.ts`.*