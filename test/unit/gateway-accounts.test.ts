import { afterEach, describe, expect, it } from 'vitest'
import { GatewayAccountService } from '../../src/backend/gateway/auth/accounts.js'
import { createDatabase, runMigrations } from '../../src/backend/gateway/db/migrate.js'
import { createRepositories } from '../../src/backend/gateway/db/repository.js'
import type { SqliteDatabase } from '../../src/backend/gateway/db/sqlite.js'
import type { Identity } from '../../src/backend/shared/policy.js'
import { DEFAULT_GATEWAY_CONFIG } from '../../src/backend/shared/config.js'
import { isAccountAuthResult, toPublicGatewayAccount } from '../../src/backend/shared/account.js'

const tailnetIdentity: Identity = {
  user: 'member@example.com',
  tailnet: 'example.com',
  device: 'member-laptop',
  deviceId: 'device-1',
}

describe('GatewayAccountService', () => {
  let db: SqliteDatabase | undefined

  afterEach(() => {
    db?.close()
    db = undefined
  })

  function createService(): GatewayAccountService {
    db = createDatabase({ ...DEFAULT_GATEWAY_CONFIG, dbPath: ':memory:' })
    runMigrations(db)
    return new GatewayAccountService(createRepositories(db).accounts)
  }

  it('persists pending accounts, requires host approval, and binds identity', () => {
    const service = createService()
    const pending = service.signUp('Member', 'MEMBER@example.com', 'password123', tailnetIdentity)

    expect(pending.status).toBe('pending')
    expect(service.signIn('member@example.com', 'password123', tailnetIdentity).status).toBe('pending')
    expect(service.listPending()).toHaveLength(1)
    expect(service.authorize(pending.account.id, tailnetIdentity)).toBeUndefined()

    service.approve(pending.account.id)
    expect(service.signIn('member@example.com', 'password123', tailnetIdentity).status).toBe('approved')
    expect(service.authorize(pending.account.id, tailnetIdentity)?.email).toBe('member@example.com')
    expect(service.authorize(pending.account.id, { ...tailnetIdentity, user: 'other@example.com' })).toBeUndefined()
  })

  it('enforces one account per Tailscale identity and rejects revoked access', () => {
    const service = createService()
    const account = service.signUp('Member', 'member@example.com', 'password123', tailnetIdentity)
    expect(() => service.signUp('Second', 'second@example.com', 'password123', tailnetIdentity)).toThrow(
      'already exists for this Tailscale identity',
    )

    service.approve(account.account.id)
    service.revoke(account.account.id)
    expect(service.authorize(account.account.id, tailnetIdentity)).toBeUndefined()
    expect(() => service.signIn('member@example.com', 'password123', tailnetIdentity)).toThrow('revoked')
  })

  it('rejects incorrect passwords and identity mismatch', () => {
    const service = createService()
    const account = service.signUp('Member', 'member@example.com', 'password123', tailnetIdentity)
    expect(() => service.signIn('member@example.com', 'incorrect123', tailnetIdentity)).toThrow(
      'Email or password is incorrect.',
    )
    expect(() => service.signIn('member@example.com', 'password123', {
      ...tailnetIdentity,
      tailnet: 'other.example',
    })).toThrow('different Tailscale identity')
    expect(account.account.id).toBeTruthy()
  })

  it('validates account-auth responses returned by remote gateways', () => {
    const service = createService()
    const result = service.signUp('Member', 'member@example.com', 'password123', tailnetIdentity, true)
    const response = {
      account: toPublicGatewayAccount(result.account),
      status: result.status,
    }

    expect(isAccountAuthResult(response)).toBe(true)
    expect(isAccountAuthResult({ ...response, status: 'pending' })).toBe(false)
    expect(isAccountAuthResult({ ...response, account: { ...response.account, createdAt: 'invalid' } })).toBe(false)
  })
})
