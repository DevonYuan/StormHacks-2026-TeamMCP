CREATE TABLE IF NOT EXISTS gateway_approvals (
  id TEXT PRIMARY KEY,
  tailscale_user TEXT NOT NULL COLLATE NOCASE,
  tailscale_tailnet TEXT NOT NULL COLLATE NOCASE,
  device TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  UNIQUE (tailscale_user, tailscale_tailnet)
);
CREATE INDEX IF NOT EXISTS idx_gateway_approvals_status ON gateway_approvals(status);

INSERT OR IGNORE INTO gateway_approvals (
  id, tailscale_user, tailscale_tailnet, device, status, created_at, approved_at
)
SELECT id, tailscale_user, tailscale_tailnet, '', status, created_at, approved_at
FROM gateway_accounts;

DROP TABLE gateway_accounts;
DROP INDEX IF EXISTS idx_gateway_accounts_status;
