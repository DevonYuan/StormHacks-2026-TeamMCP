-- Team MCP Gateway Database Schema
-- Run with: better-sqlite3 gateway.db < schema.sql

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- MCP Server Registry
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('stdio', 'streamable-http', 'sse')),
  -- stdio fields
  command TEXT,
  args TEXT, -- JSON array
  env TEXT,  -- JSON object
  cwd TEXT,
  -- HTTP fields
  url TEXT,
  headers TEXT, -- JSON object
  -- Metadata
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Server capabilities cache (tools, resources, prompts)
CREATE TABLE IF NOT EXISTS server_capabilities (
  server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  tools TEXT NOT NULL DEFAULT '[]', -- JSON array of Tool objects
  resources TEXT NOT NULL DEFAULT '[]', -- JSON array of Resource objects
  prompts TEXT NOT NULL DEFAULT '[]', -- JSON array of Prompt objects
  capabilities TEXT NOT NULL DEFAULT '{}', -- JSON ServerCapabilities
  last_fetched INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  fetch_error TEXT
);

-- Authorization Policy
CREATE TABLE IF NOT EXISTS policy (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton row
  version INTEGER NOT NULL DEFAULT 1,
  default_effect TEXT NOT NULL DEFAULT 'deny' CHECK (default_effect IN ('allow', 'deny')),
  rules TEXT NOT NULL DEFAULT '[]', -- JSON array of PolicyRule
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_by TEXT NOT NULL
);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  -- Identity
  identity_user TEXT NOT NULL,
  identity_device TEXT NOT NULL,
  identity_device_id TEXT NOT NULL,
  identity_tailnet TEXT NOT NULL,
  -- Request
  method TEXT NOT NULL,
  server_id TEXT NOT NULL,
  tool_name TEXT,
  request_summary TEXT NOT NULL,
  response_summary TEXT NOT NULL,
  success INTEGER NOT NULL,
  error_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  -- Optional full payloads (when redaction disabled)
  request_payload TEXT, -- JSON
  response_payload TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Indexes for activity log queries
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_identity ON activity_log(identity_user, identity_device_id);
CREATE INDEX IF NOT EXISTS idx_activity_server ON activity_log(server_id);
CREATE INDEX IF NOT EXISTS idx_activity_tool ON activity_log(tool_name);
CREATE INDEX IF NOT EXISTS idx_activity_success ON activity_log(success);

-- Session Tokens (revocation list - tokens are stateless but we track revoked ones)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY, -- SHA-256 of token
  revoked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  reason TEXT
);

-- Gateway-local accounts linked to a verified Tailscale identity.
CREATE TABLE IF NOT EXISTS gateway_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  tailscale_user TEXT NOT NULL COLLATE NOCASE,
  tailscale_tailnet TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  UNIQUE (tailscale_user, tailscale_tailnet)
);
CREATE INDEX IF NOT EXISTS idx_gateway_accounts_status ON gateway_accounts(status);

-- Gateway signing key (stored encrypted via Electron safeStorage in practice, but schema here for reference)
-- In reality, the Ed25519 private key is stored in OS keychain via Electron safeStorage
-- This table tracks key metadata
CREATE TABLE IF NOT EXISTS signing_keys (
  id TEXT PRIMARY KEY, -- Key ID (kid)
  public_key TEXT NOT NULL, -- Base64 encoded Ed25519 public key
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  active INTEGER NOT NULL DEFAULT 1
);

-- Server health checks
CREATE TABLE IF NOT EXISTS server_health (
  server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_check INTEGER,
  latency_ms INTEGER,
  error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);