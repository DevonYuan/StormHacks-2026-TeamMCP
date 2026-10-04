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
