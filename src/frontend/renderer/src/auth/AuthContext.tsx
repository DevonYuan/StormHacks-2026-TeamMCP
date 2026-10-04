import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LocalProfileStore } from './localProfile'
import type { AccountMode, AuthEvent, AuthUser } from './localProfile'

interface AuthContextValue {
  user: AuthUser | null
  mode: AccountMode
  events: AuthEvent[]
  signIn(email: string, password: string, mode: AccountMode): Promise<void>
  signUp(name: string, email: string, password: string, mode: AccountMode): Promise<void>
  continueAsGuest(mode: AccountMode): void
  signOut(): void
  setMode(mode: AccountMode): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Provide a local app profile; gateway access is controlled independently by Tailscale approval. */
export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [store] = useState(() => new LocalProfileStore(import.meta.env.DEV))
  const [session] = useState(() => store.restoreSession())
  const [user, setUser] = useState<AuthUser | null>(session?.user ?? null)
  const [mode, setModeState] = useState<AccountMode>(session?.mode ?? 'server')
  const [, setRevision] = useState(0)

  const refreshEvents = useCallback(() => setRevision(revision => revision + 1), [])

  const signIn = useCallback(async (
    email: string,
    password: string,
    nextMode: AccountMode,
  ): Promise<void> => {
    const signedInUser = await store.signIn(email, password, nextMode)
    setUser(signedInUser)
    setModeState(nextMode)
    refreshEvents()
  }, [store, refreshEvents])

  const signUp = useCallback(async (
    name: string,
    email: string,
    password: string,
    nextMode: AccountMode,
  ): Promise<void> => {
    const newUser = await store.signUp(name, email, password, nextMode)
    setUser(newUser)
    setModeState(nextMode)
    refreshEvents()
  }, [store, refreshEvents])

  const continueAsGuest = useCallback((nextMode: AccountMode) => {
    setUser(store.createGuest(nextMode))
    setModeState(nextMode)
    refreshEvents()
  }, [store, refreshEvents])

  const signOut = useCallback(() => {
    if (user) store.signOut(user, mode)
    setUser(null)
    refreshEvents()
  }, [store, user, mode, refreshEvents])

  const setMode = useCallback((nextMode: AccountMode) => {
    if (nextMode === mode) return
    setModeState(nextMode)
    if (user) store.recordModeChange(user, nextMode)
    refreshEvents()
  }, [store, user, mode, refreshEvents])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    mode,
    events: store.getEvents(),
    signIn,
    signUp,
    continueAsGuest,
    signOut,
    setMode,
  }), [user, mode, store, signIn, signUp, continueAsGuest, signOut, setMode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Read the current mock user session or fail if the provider is missing. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
