import { describe, expect, it } from 'vitest'
import { hashPassword, isPasswordHash, verifyPassword } from '../../src/frontend/renderer/src/auth/password.js'

describe('password hashing', () => {
  it('produces a self-describing PBKDF2 hash with a random salt', async () => {
    const first = await hashPassword('correct horse battery', 1000)
    const second = await hashPassword('correct horse battery', 1000)

    expect(isPasswordHash(first)).toBe(true)
    expect(first).toMatch(/^pbkdf2\$1000\$[^$]+\$[^$]+$/)
    // Same password, different random salts → different hashes.
    expect(first).not.toBe(second)
  })

  it('verifies the correct password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery', 1000)
    expect(await verifyPassword('correct horse battery', hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('recognises legacy plaintext values as non-hashes', async () => {
    expect(isPasswordHash('plain-text')).toBe(false)
    expect(await verifyPassword('plain-text', 'plain-text')).toBe(true)
    expect(await verifyPassword('other', 'plain-text')).toBe(false)
  })

  it('rejects malformed hash strings instead of throwing', async () => {
    expect(isPasswordHash('pbkdf2$not-a-number$salt$hash')).toBe(false)
    expect(isPasswordHash('pbkdf2$1000$salt')).toBe(false)
    expect(await verifyPassword('anything', 'pbkdf2$1000$c2FsdA==$aGFzaA==')).toBe(false)
  })
})
