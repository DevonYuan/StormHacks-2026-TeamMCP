import { afterEach, describe, expect, it } from 'vitest'
import { GatewayApprovalService } from '../../src/backend/gateway/auth/approvals.js'
import { createDatabase, runMigrations } from '../../src/backend/gateway/db/migrate.js'
import { createRepositories } from '../../src/backend/gateway/db/repository.js'
import type { SqliteDatabase } from '../../src/backend/gateway/db/sqlite.js'
import type { Identity } from '../../src/backend/shared/policy.js'
import { DEFAULT_GATEWAY_CONFIG } from '../../src/backend/shared/config.js'

const tailnetIdentity: Identity = {
  user: 'member@example.com',
  tailnet: 'example.com',
  device: 'member-laptop',
  deviceId: 'device-1',
}

describe('GatewayApprovalService', () => {
  let db: SqliteDatabase | undefined

  afterEach(() => {
    db?.close()
    db = undefined
  })

  function createService(): GatewayApprovalService {
    db = createDatabase({ ...DEFAULT_GATEWAY_CONFIG, dbPath: ':memory:' })
    runMigrations(db)
    return new GatewayApprovalService(createRepositories(db).approvals)
  }

  it('creates a host-local pending request from a verified Tailscale identity', () => {
    const service = createService()
    const pending = service.request(tailnetIdentity)

    expect(pending.status).toBe('pending')
    expect(pending.tailscaleUser).toBe(tailnetIdentity.user)
    expect(service.authorize(tailnetIdentity)).toBeUndefined()
    expect(service.listAll()).toHaveLength(1)
  })

  it('grants every device for an approved Tailscale user on this tailnet only', () => {
    const service = createService()
    const pending = service.request(tailnetIdentity)
    service.approve(pending.id)

    expect(service.authorize({ ...tailnetIdentity, device: 'phone', deviceId: 'device-2' })?.id)
      .toBe(pending.id)
    expect(service.authorize({ ...tailnetIdentity, tailnet: 'other.example' })).toBeUndefined()
    expect(service.authorize({ ...tailnetIdentity, user: 'other@example.com' })).toBeUndefined()
  })

  it('preserves revoked access until the host explicitly restores it', () => {
    const service = createService()
    const pending = service.request(tailnetIdentity)
    service.approve(pending.id)
    service.revoke(pending.id)

    expect(service.authorize(tailnetIdentity)).toBeUndefined()
    expect(service.request(tailnetIdentity).status).toBe('revoked')
    expect(service.approve(pending.id).status).toBe('approved')
    expect(service.authorize(tailnetIdentity)?.id).toBe(pending.id)
  })

  it('auto-approves the local host identity idempotently', () => {
    const service = createService()
    const approved = service.trustLocalHost(tailnetIdentity)

    expect(approved.status).toBe('approved')
    expect(service.trustLocalHost(tailnetIdentity).id).toBe(approved.id)
  })

  it('migrates existing gateway accounts into access approvals and drops credential storage', () => {
    db = createDatabase({ ...DEFAULT_GATEWAY_CONFIG, dbPath: ':memory:' })
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      INSERT INTO schema_version (version, applied_at) VALUES (2, 1);
      CREATE TABLE gateway_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        tailscale_user TEXT NOT NULL,
        tailscale_tailnet TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        approved_at INTEGER
      );
      INSERT INTO gateway_accounts
        (id, email, name, password_hash, tailscale_user, tailscale_tailnet, status, created_at, approved_at)
      VALUES
        ('legacy-id', 'member@example.com', 'Member', 'scrypt-hash', 'member@example.com', 'example.com', 'approved', 1, 2);
    `)

    runMigrations(db)
    const repos = createRepositories(db)
    expect(repos.approvals.getByIdentity(tailnetIdentity)).toMatchObject({
      id: 'legacy-id',
      tailscaleUser: 'member@example.com',
      tailnet: 'example.com',
      status: 'approved',
    })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gateway_accounts'").get())
      .toBeUndefined()
  })
})
