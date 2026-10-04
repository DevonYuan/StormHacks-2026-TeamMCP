import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { AccountStatus, GatewayAccount } from '../../shared/account.js'
import type { Identity } from '../../shared/policy.js'
import type { GatewayAccountRepository } from '../db/repository.js'

const HASH_BYTES = 64
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

interface AccountServiceAuthResult {
  account: GatewayAccount
  status: AccountStatus
}

/** Own gateway-scoped account registration, login, and approval. */
export class GatewayAccountService {
  constructor(private readonly accounts: GatewayAccountRepository) {}

  signUp(
    name: string,
    email: string,
    password: string,
    identity: Identity,
    autoApprove = false,
  ): AccountServiceAuthResult {
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanName) throw new Error('Enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Enter a valid email address.')
    }
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
    if (this.accounts.getByEmail(cleanEmail)) throw new Error('An account with this email already exists.')
    if (this.accounts.getByIdentity(identity)) {
      throw new Error('A gateway account already exists for this Tailscale identity.')
    }

    const account = this.accounts.createPending(
      { name: cleanName, email: cleanEmail, identity },
      this.hashPassword(password),
    )
    const approved = autoApprove ? this.accounts.approve(account.id) : undefined
    const result = approved ?? account
    return { account: result, status: result.status }
  }

  signIn(email: string, password: string, identity: Identity): AccountServiceAuthResult {
    const record = this.accounts.getByEmail(email.trim().toLowerCase())
    if (!record || !this.verifyPassword(password, record.passwordHash)) {
      throw new Error('Email or password is incorrect.')
    }
    if (record.identity.user.toLowerCase() !== identity.user.toLowerCase() ||
        record.identity.tailnet.toLowerCase() !== identity.tailnet.toLowerCase()) {
      throw new Error('This account is registered to a different Tailscale identity.')
    }
    if (record.status === 'revoked') throw new Error('This account has been revoked by the gateway host.')
    return { account: record, status: record.status }
  }

  listPending(): GatewayAccount[] {
    return this.accounts.getPending()
  }

  listAll(): GatewayAccount[] {
    return this.accounts.getAll()
  }

  approve(id: string): GatewayAccount {
    const account = this.accounts.approve(id)
    if (!account) throw new Error('Pending account not found.')
    return account
  }

  revoke(id: string): void {
    if (!this.accounts.revoke(id)) throw new Error('Approved account not found.')
  }

  authorize(accountId: string, identity: Identity): GatewayAccount | undefined {
    const account = this.accounts.getApprovedById(accountId)
    if (!account) return undefined
    return account.identity.user.toLowerCase() === identity.user.toLowerCase() &&
      account.identity.tailnet.toLowerCase() === identity.tailnet.toLowerCase()
      ? account
      : undefined
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16)
    const hash = scryptSync(password, salt, HASH_BYTES, SCRYPT_OPTIONS)
    return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
  }

  private verifyPassword(password: string, encoded: string): boolean {
    const [algorithm, n, r, p, saltText, hashText] = encoded.split('$')
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltText || !hashText) return false
    const expected = Buffer.from(hashText, 'base64url')
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_OPTIONS.maxmem,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
