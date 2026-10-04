/**
 * Main authentication module combining Tailscale identity with session tokens.
 */

import { GatewayConfig } from '../../shared/config.js'
import { Identity, TokenClaims } from '../../shared/policy.js'
import { RevokedTokenRepository } from '../db/repository.js'
import {
  resolveIdentityFromIp,
  getLocalTailscaleIdentity,
  getLocalTailnetInfo,
  isTailscaleAvailable,
} from './tailscale.js'
import {
  initializeSigningKey,
  getSigningKeyPair,
  exportPrivateKeyBase64,
  exportPublicKeyBase64,
  verifySessionToken,
  revokeToken,
  getPermissionsFromToken,
  VerifiedToken,
} from './tokens.js'

export interface AuthContext {
  identity: Identity
  token: string
  claims: TokenClaims
  approvalId?: string
}

export class AuthManager {
  private config: GatewayConfig
  private revokedTokens: RevokedTokenRepository
  private tailscaleAvailable: boolean = false

  constructor(config: GatewayConfig, revokedTokens: RevokedTokenRepository) {
    this.config = config
    this.revokedTokens = revokedTokens
  }

  async initialize(privateKeyB64?: string): Promise<void> {
    // Initialize signing key
    initializeSigningKey(privateKeyB64)

    // Check Tailscale availability
    this.tailscaleAvailable = await isTailscaleAvailable(this.config)
    if (!this.tailscaleAvailable) {
      console.warn('Tailscale CLI not available - falling back to local-only mode')
    }
  }

  getSigningKeyInfo(): { kid: string; publicKey: string } | null {
    const kp = getSigningKeyPair()
    if (!kp) return null
    return {
      kid: kp.kid,
      publicKey: exportPublicKeyBase64() || '',
    }
  }

  exportPrivateKey(): string | null {
    return exportPrivateKeyBase64()
  }

  async resolveClientIdentity(clientIp: string): Promise<Identity | null> {
    const normalized = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp
    if (normalized === '127.0.0.1' || normalized === '::1') {
      const localIdentity = await getLocalTailscaleIdentity(this.config)
      if (localIdentity) return localIdentity
      if (process.env.NODE_ENV !== 'production') {
        return {
          user: 'local@dev',
          device: 'localhost',
          deviceId: 'local-dev-device',
          tailnet: 'local',
        }
      }
      return null
    }
    if (!this.tailscaleAvailable) return null
    return resolveIdentityFromIp(normalized, this.config)
  }

  // Verify a session token and return claims
  verifyToken(token: string): VerifiedToken {
    return verifySessionToken(token, this.revokedTokens)
  }

  // Get permissions from token (for policy evaluation)
  getTokenPermissions(token: string): TokenClaims['permissions'] | null {
    return getPermissionsFromToken(token, this.revokedTokens)
  }

  // Revoke a token
  revokeToken(token: string, reason?: string): void {
    revokeToken(token, this.revokedTokens, reason)
  }

  // Get local tailnet info for display in UI
  async getLocalInfo() {
    if (!this.tailscaleAvailable) return null
    return getLocalTailnetInfo(this.config)
  }

  // Check if Tailscale is available
  isTailscaleReady(): boolean {
    return this.tailscaleAvailable
  }
}

// Factory function
export function createAuthManager(config: GatewayConfig, revokedTokens: RevokedTokenRepository): AuthManager {
  return new AuthManager(config, revokedTokens)
}