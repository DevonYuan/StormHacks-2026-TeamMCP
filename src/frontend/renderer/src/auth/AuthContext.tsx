import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MockAuthStore } from './mockAuth'
import type { AccountMode, AuthEvent, AuthUser } from './mockAuth'
import type { AccountStatus } from '@shared/account'

interface AuthContextValue {
  user: AuthUser | null
  mode: AccountMode
  events: AuthEvent[]
  signIn(email: string, password: string, mode: AccountMode, hostAddress?: string): Promise<AccountStatus>
  signUp(name: string, email: string, password: string, mode: AccountMode, hostAddress?: string): Promise<AccountStatus>
  continueAsGuest(mode: AccountMode): void
  signOut(): void
  setMode(mode: AccountMode): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toAuthUser(
  account: AuthUser | { id: string; name: string; email: string; createdAt: number; tailscaleUser: string; tailnet: string },
  hostAddress: string,
): AuthUser {
  if (!('id' in account)) return account
  return {
    name: account.name,
    email: account.email,
    createdAt: account.createdAt,
    accountId: account.id,
    tailscaleUser: account.tailscaleUser,
    tailnet: account.tailnet,
    hostAddress: hostAddress || undefined,
  }
}

/** Provide the gateway-backed account session and development-only demo history. */
export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [store] = useState(() => new MockAuthStore())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mode, setModeState] = useState<AccountMode>('server')
  const [, setRevision] = useState(0)

  const refreshEvents = useCallback(() => setRevision(revision => revision + 1), [])

  const signIn = useCallback(async (
    email: string,
    password: string,
    nextMode: AccountMode,
    hostAddress = '',
  ): Promise<AccountStatus> => {
    const api = window.electronAPI
    if (!api && !import.meta.env.DEV) {
      throw new Error('Account authentication requires the desktop application.')
    }
    const result = api
      ? await api.accounts.signIn(hostAddress, email, password)
      : { account: store.signIn(email, password, nextMode), status: 'approved' as const }
    if (result.status !== 'approved') return result.status
    const signedInUser = toAuthUser(result.account, hostAddress)
    setUser(signedInUser)
    setModeState(nextMode)
    refreshEvents()
    return result.status
  }, [store, refreshEvents])

  const signUp = useCallback(async (
    name: string,
    email: string,
    password: string,
    nextMode: AccountMode,
    hostAddress = '',
  ): Promise<AccountStatus> => {
    const api = window.electronAPI
    if (!api && !import.meta.env.DEV) {
      throw new Error('Account authentication requires the desktop application.')
    }
    const result = api
      ? await api.accounts.signUp(hostAddress, name, email, password)
      : { account: store.signUp(name, email, password, nextMode), status: 'approved' as const }
    if (result.status !== 'approved') return result.status
    const newUser = toAuthUser(result.account, hostAddress)
    setUser(newUser)
    setModeState(nextMode)
    refreshEvents()
    return result.status
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
