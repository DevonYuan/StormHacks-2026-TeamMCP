import type { Identity } from './policy.js'

export type AccountStatus = 'pending' | 'approved' | 'revoked'

export interface GatewayAccount {
  id: string
  name: string
  email: string
  identity: Identity
  status: AccountStatus
  createdAt: number
  approvedAt?: number
}

export interface AccountAuthResult {
  account: PublicGatewayAccount
  status: AccountStatus
}

export type PublicGatewayAccount = Omit<GatewayAccount, 'identity'> & {
  tailscaleUser: string
  tailnet: string
}

export function toPublicGatewayAccount(account: GatewayAccount): PublicGatewayAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    status: account.status,
    createdAt: account.createdAt,
    approvedAt: account.approvedAt,
    tailscaleUser: account.identity.user,
    tailnet: account.identity.tailnet,
  }
}

/** Validate account-auth responses received from a remote gateway. */
export function isAccountAuthResult(value: unknown): value is AccountAuthResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  const account = result.account
  if (!account || typeof account !== 'object') return false
  const publicAccount = account as Record<string, unknown>
  const statuses: AccountStatus[] = ['pending', 'approved', 'revoked']
  return (
    statuses.includes(result.status as AccountStatus) &&
    result.status === publicAccount.status &&
    typeof publicAccount.id === 'string' &&
    typeof publicAccount.name === 'string' &&
    typeof publicAccount.email === 'string' &&
    typeof publicAccount.tailscaleUser === 'string' &&
    typeof publicAccount.tailnet === 'string' &&
    typeof publicAccount.createdAt === 'number' &&
    Number.isFinite(publicAccount.createdAt) &&
    (publicAccount.approvedAt === undefined ||
      (typeof publicAccount.approvedAt === 'number' && Number.isFinite(publicAccount.approvedAt)))
  )
}
