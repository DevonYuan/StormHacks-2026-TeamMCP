import { hashPassword, isPasswordHash, verifyPassword } from './password'

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

interface LocalProfile extends AuthUser {
  /** PBKDF2 hash for new accounts; legacy profiles may still hold a plaintext value. */
  password: string
}

/** Persisted session pointer used to restore the signed-in profile on relaunch. */
interface StoredSession {
  email: string
  mode: AccountMode
}

/** Minimal synchronous key/value store; satisfied by the browser localStorage. */
export interface ProfileStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PROFILES_KEY = 'tether.profiles.v1'
const SESSION_KEY = 'tether.session.v1'

/** Return the renderer localStorage when available, or null in non-browser environments. */
function defaultStorage(): ProfileStorage | null {
  try {
    const storage = (globalThis as { localStorage?: ProfileStorage }).localStorage
    return storage ?? null
  } catch {
    return null
  }
}

/** Provide persistent local profiles and session events; this is not gateway authentication. */
export class LocalProfileStore {
  private readonly profiles = new Map<string, LocalProfile>()
  private readonly events: AuthEvent[] = []
  private nextEventId = 1
  private readonly storage: ProfileStorage | null

  constructor(includeDemo = false, storage: ProfileStorage | null = defaultStorage()) {
    this.storage = storage
    this.loadProfiles()
    if (includeDemo) {
      this.profiles.set('demo@tether.local', {
        name: 'Demo User',
        email: 'demo@tether.local',
        password: 'demo1234',
        createdAt: Date.now(),
      })
    }
  }

  /** Create a persistent local profile and record the signup event. */
  async signUp(name: string, email: string, password: string, mode: AccountMode): Promise<AuthUser> {
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanName) throw new Error('Enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.')
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
    if (this.profiles.has(cleanEmail)) throw new Error('A profile with this email already exists.')

    const user: LocalProfile = {
      name: cleanName,
      email: cleanEmail,
      password: await hashPassword(password),
      createdAt: Date.now(),
    }
    this.profiles.set(cleanEmail, user)
    this.persistProfiles()
    this.persistSession(user.email, mode)
    this.record('signed-up', user.email, mode)
    return this.publicUser(user)
  }

  /** Verify a stored profile and record the login event, upgrading legacy plaintext hashes. */
  async signIn(email: string, password: string, mode: AccountMode): Promise<AuthUser> {
    const cleanEmail = email.trim().toLowerCase()
    const account = this.profiles.get(cleanEmail)
    const valid = account ? await verifyPassword(password, account.password) : false
    if (!account || !valid) throw new Error('Email or password is incorrect.')

    if (!isPasswordHash(account.password)) {
      account.password = await hashPassword(password)
      this.persistProfiles()
    }

    this.persistSession(account.email, mode)
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

  /** Record a logout for the active profile and forget the stored session. */
  signOut(user: AuthUser, mode: AccountMode): void {
    this.clearSession()
    this.record('signed-out', user.email, mode)
  }

  /** Record a change between client and server mode and keep the stored session in sync. */
  recordModeChange(user: AuthUser, mode: AccountMode): void {
    this.persistSession(user.email, mode)
    this.record('mode-changed', user.email, mode)
  }

  /** Restore the signed-in profile and mode persisted from a previous launch, if any. */
  restoreSession(): { user: AuthUser; mode: AccountMode } | null {
    const raw = this.read(SESSION_KEY)
    if (!raw) return null
    try {
      const session = JSON.parse(raw) as StoredSession
      const account = this.profiles.get(session.email)
      if (!account) return null
      return { user: this.publicUser(account), mode: session.mode === 'client' ? 'client' : 'server' }
    } catch {
      return null
    }
  }

  /** Return a newest-first copy of the in-memory authentication history. */
  getEvents(): AuthEvent[] {
    return [...this.events].reverse()
  }

  /** Load persisted profiles into memory, ignoring missing or corrupt storage. */
  private loadProfiles(): void {
    const raw = this.read(PROFILES_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as LocalProfile[]
      if (!Array.isArray(parsed)) return
      for (const profile of parsed) {
        if (typeof profile?.email === 'string' && typeof profile.password === 'string') {
          this.profiles.set(profile.email, profile)
        }
      }
    } catch {
      // Ignore unreadable storage and continue with an empty profile list.
    }
  }

  /** Write the current profiles to storage so accounts survive an app restart. */
  private persistProfiles(): void {
    this.write(PROFILES_KEY, JSON.stringify([...this.profiles.values()]))
  }

  /** Remember the active profile pointer so the session can be restored on relaunch. */
  private persistSession(email: string, mode: AccountMode): void {
    const session: StoredSession = { email, mode }
    this.write(SESSION_KEY, JSON.stringify(session))
  }

  /** Forget the persisted session on logout. */
  private clearSession(): void {
    try {
      this.storage?.removeItem(SESSION_KEY)
    } catch {
      // Ignore storage failures.
    }
  }

  /** Read a value from storage, tolerating unavailable or throwing implementations. */
  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  /** Write a value to storage, tolerating unavailable or throwing implementations. */
  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value)
    } catch {
      // Ignore storage failures (for example quota errors) and stay in memory only.
    }
  }

  /** Return public account fields without exposing the stored password. */
  private publicUser(account: LocalProfile): AuthUser {
    const { name, email, createdAt } = account
    return { name, email, createdAt }
  }

  /** Append an account event to the volatile session history. */
  private record(type: AuthEventType, email: string, mode: AccountMode): void {
    this.events.push({ id: this.nextEventId++, type, email, mode, timestamp: Date.now() })
  }
}
