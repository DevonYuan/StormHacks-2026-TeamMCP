import { describe, expect, it } from 'vitest'
import { MockAuthStore } from '../../src/frontend/renderer/src/auth/mockAuth.js'

describe('MockAuthStore', () => {
  it('creates an account, signs in again, and records session events', () => {
    const store = new MockAuthStore()

    const user = store.signUp(' Test User ', 'TEST@example.com', 'safe-pass-1', 'client')
    expect(user).toMatchObject({ name: 'Test User', email: 'test@example.com' })

    const signedIn = store.signIn('test@example.com', 'safe-pass-1', 'server')
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

  it('provides the documented demo account', () => {
    const store = new MockAuthStore()
    expect(store.signIn('demo@tether.local', 'demo1234', 'server').name).toBe('Demo User')
  })

  it('creates a development guest without requiring credentials', () => {
    const store = new MockAuthStore()
    const guest = store.createGuest('client')

    expect(guest).toMatchObject({ name: 'Development User' })
    expect(guest.email).toMatch(/^developer-.+@local$/)
    expect(store.getEvents()).toMatchObject([{ type: 'guest-session', email: guest.email, mode: 'client' }])
  })

  it('rejects invalid signup details and duplicate emails', () => {
    const store = new MockAuthStore()
    expect(() => store.signUp('', 'new@example.com', 'password1', 'server')).toThrow('Enter your name.')
    expect(() => store.signUp('New User', 'invalid', 'password1', 'server')).toThrow('valid email')
    expect(() => store.signUp('New User', 'new@example.com', 'short', 'server')).toThrow('8 characters')
    store.signUp('New User', 'new@example.com', 'password1', 'server')
    expect(() => store.signUp('Duplicate', 'NEW@example.com', 'password1', 'server')).toThrow('already exists')
  })

  it('does not reveal whether an account exists on a failed login', () => {
    const store = new MockAuthStore()
    expect(() => store.signIn('missing@example.com', 'wrong-pass', 'client')).toThrow(
      'Email or password is incorrect.',
    )
    expect(() => store.signIn('demo@tether.local', 'wrong-pass', 'client')).toThrow(
      'Email or password is incorrect.',
    )
  })
})
