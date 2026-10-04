export type AccountMode = 'client' | 'server'
export type AuthEventType = 'signed-up' | 'signed-in' | 'signed-out' | 'mode-changed' | 'guest-session'

export interface AuthUser {
  name: string
  email: string
  createdAt: number
}

export interface AuthEvent {
  id: number
  type: AuthEventType
  email: string
  mode: AccountMode
  timestamp: number
}

interface MockAccount extends AuthUser {
  password: string
}

/** Provide volatile mock accounts and session events until a real auth backend exists. */
export class MockAuthStore {
  private readonly accounts = new Map<string, MockAccount>()
  private readonly events: AuthEvent[] = []
  private nextEventId = 1

  constructor() {
    this.accounts.set('demo@tether.local', {
      name: 'Demo User',
      email: 'demo@tether.local',
      password: 'demo1234',
      createdAt: Date.now(),
    })
  }

  /** Create a session-local account and record the signup event. */
  signUp(name: string, email: string, password: string, mode: AccountMode): AuthUser {
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanName) throw new Error('Enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.')
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
    if (this.accounts.has(cleanEmail)) throw new Error('An account with this email already exists.')

    const user: MockAccount = {
      name: cleanName,
      email: cleanEmail,
      password,
      createdAt: Date.now(),
    }
    this.accounts.set(cleanEmail, user)
    this.record('signed-up', user.email, mode)
    return this.publicUser(user)
  }

  /** Verify a session-local account and record the login event. */
  signIn(email: string, password: string, mode: AccountMode): AuthUser {
    const cleanEmail = email.trim().toLowerCase()
    const account = this.accounts.get(cleanEmail)
    if (!account || account.password !== password) throw new Error('Email or password is incorrect.')
    this.record('signed-in', account.email, mode)
    return this.publicUser(account)
  }

  /** Create a password-free development session and record its start. */
  createGuest(mode: AccountMode): AuthUser {
    const user: AuthUser = {
      name: 'Development User',
      email: `developer-${Date.now().toString(36)}@local`,
      createdAt: Date.now(),
    }
    this.record('guest-session', user.email, mode)
    return user
  }

  /** Record a logout for the active account. */
  signOut(user: AuthUser, mode: AccountMode): void {
    this.record('signed-out', user.email, mode)
  }

  /** Record a change between client and server mode. */
  recordModeChange(user: AuthUser, mode: AccountMode): void {
    this.record('mode-changed', user.email, mode)
  }

  /** Return a newest-first copy of the in-memory authentication history. */
  getEvents(): AuthEvent[] {
    return [...this.events].reverse()
  }

  /** Return public account fields without exposing the stored password. */
  private publicUser(account: MockAccount): AuthUser {
    const { name, email, createdAt } = account
    return { name, email, createdAt }
  }

  /** Append an account event to the volatile session history. */
  private record(type: AuthEventType, email: string, mode: AccountMode): void {
    this.events.push({ id: this.nextEventId++, type, email, mode, timestamp: Date.now() })
  }
}
