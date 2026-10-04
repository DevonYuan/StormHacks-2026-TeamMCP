import { describe, expect, it } from 'vitest'
import { LocalProfileStore } from '../../src/frontend/renderer/src/auth/localProfile.js'
import type { ProfileStorage } from '../../src/frontend/renderer/src/auth/localProfile.js'

/** Create an in-memory storage that survives across store instances, like localStorage. */
function memoryStorage(): ProfileStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

describe('LocalProfileStore', () => {
  it('creates an account, signs in again, and records session events', async () => {
    const store = new LocalProfileStore()

    const user = await store.signUp(' Test User ', 'TEST@example.com', 'safe-pass-1', 'client')
    expect(user).toMatchObject({ name: 'Test User', email: 'test@example.com' })

    const signedIn = await store.signIn('test@example.com', 'safe-pass-1', 'server')
    expect(signedIn).toEqual(user)
    store.recordModeChange(signedIn, 'client')
    store.signOut(signedIn, 'client')

    expect(store.getEvents().map(event => event.type)).toEqual([
      'signed-out',
      'mode-changed',
      'signed-in',
      'signed-up',
    ])
    expect(store.getEvents().every(event => event.email === 'test@example.com')).toBe(true)
  })

  it('never stores the raw password', async () => {
    const storage = memoryStorage()
    const store = new LocalProfileStore(false, storage)
    await store.signUp('Secret User', 'secret@example.com', 'super-secret-1', 'server')

    const raw = storage.getItem('tether.profiles.v1') ?? ''
    expect(raw).not.toContain('super-secret-1')
    expect(JSON.parse(raw)[0].password).toMatch(/^pbkdf2\$/)
  })

  it('provides the documented demo account', async () => {
    const store = new LocalProfileStore(true)
    expect((await store.signIn('demo@tether.local', 'demo1234', 'server')).name).toBe('Demo User')
  })

  it('does not seed demo credentials outside development mode', async () => {
    const store = new LocalProfileStore()
    await expect(store.signIn('demo@tether.local', 'demo1234', 'server')).rejects.toThrow(
      'Email or password is incorrect.',
    )
  })

  it('creates a development guest without requiring credentials', () => {
    const store = new LocalProfileStore()
    const guest = store.createGuest('client')

    expect(guest).toMatchObject({ name: 'Development User' })
    expect(guest.email).toMatch(/^developer-.+@local$/)
    expect(store.getEvents()).toMatchObject([{ type: 'guest-session', email: guest.email, mode: 'client' }])
  })

  it('rejects invalid signup details and duplicate emails', async () => {
    const store = new LocalProfileStore()
    await expect(store.signUp('', 'new@example.com', 'password1', 'server')).rejects.toThrow('Enter your name.')
    await expect(store.signUp('New User', 'invalid', 'password1', 'server')).rejects.toThrow('valid email')
    await expect(store.signUp('New User', 'new@example.com', 'short', 'server')).rejects.toThrow('8 characters')
    await store.signUp('New User', 'new@example.com', 'password1', 'server')
    await expect(store.signUp('Duplicate', 'NEW@example.com', 'password1', 'server')).rejects.toThrow(
      'already exists',
    )
  })

  it('does not reveal whether an account exists on a failed login', async () => {
    const store = new LocalProfileStore(true)
    await expect(store.signIn('missing@example.com', 'wrong-pass', 'client')).rejects.toThrow(
      'Email or password is incorrect.',
    )
    await expect(store.signIn('demo@tether.local', 'wrong-pass', 'client')).rejects.toThrow(
      'Email or password is incorrect.',
    )
  })

  it('upgrades a legacy plaintext profile to a hash on next sign in', async () => {
    const storage = memoryStorage()
    storage.setItem(
      'tether.profiles.v1',
      JSON.stringify([
        { name: 'Legacy User', email: 'legacy@example.com', password: 'legacy-pass-1', createdAt: Date.now() },
      ]),
    )

    const store = new LocalProfileStore(false, storage)
    const user = await store.signIn('legacy@example.com', 'legacy-pass-1', 'server')
    expect(user.name).toBe('Legacy User')
    expect(JSON.parse(storage.getItem('tether.profiles.v1') ?? '[]')[0].password).toMatch(/^pbkdf2\$/)
  })

  it('persists accounts so a new store can sign in after a restart', async () => {
    const storage = memoryStorage()
    const first = new LocalProfileStore(false, storage)
    await first.signUp('Persisted User', 'persisted@example.com', 'safe-pass-1', 'server')

    const restarted = new LocalProfileStore(false, storage)
    const signedIn = await restarted.signIn('persisted@example.com', 'safe-pass-1', 'client')
    expect(signedIn).toMatchObject({ name: 'Persisted User', email: 'persisted@example.com' })
  })

  it('restores the active session and mode on relaunch, and clears it on sign out', async () => {
    const storage = memoryStorage()
    const first = new LocalProfileStore(false, storage)
    const user = await first.signUp('Session User', 'session@example.com', 'safe-pass-1', 'client')
    first.recordModeChange(user, 'server')

    const restarted = new LocalProfileStore(false, storage)
    expect(restarted.restoreSession()).toMatchObject({
      user: { email: 'session@example.com' },
      mode: 'server',
    })

    restarted.signOut(user, 'server')
    expect(new LocalProfileStore(false, storage).restoreSession()).toBeNull()
  })

  it('ignores corrupt storage instead of throwing', async () => {
    const storage = memoryStorage()
    storage.setItem('tether.profiles.v1', '{not-json')
    storage.setItem('tether.session.v1', 'also-not-json')

    const store = new LocalProfileStore(false, storage)
    expect(store.restoreSession()).toBeNull()
    await expect(store.signUp('Fresh User', 'fresh@example.com', 'safe-pass-1', 'server')).resolves.toMatchObject(
      { email: 'fresh@example.com' },
    )
  })
})
