/**
 * Ed25519-signed session tokens for gateway authentication.
 * Private key stored via Electron safeStorage (OS keychain).
 * Tokens are stateless JWT-like structures with Ed25519 signatures.
 */

import { sign, verify, generateKeyPairSync, createHash, KeyObject, createPublicKey, createPrivateKey } from 'node:crypto'
import { GatewayConfig } from '../../shared/config.js'
import { Identity, TokenClaims } from '../../shared/policy.js'
import { RevokedTokenRepository } from '../db/repository.js'

// Token format: base64url(header).base64url(payload).base64url(signature)
// Header: { alg: 'EdDSA', typ: 'JWT', kid: string }
// Payload: TokenClaims

interface TokenHeader {
  alg: 'EdDSA'
  typ: 'JWT'
  kid: string
}

function base64urlEncode(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  return buf.toString('base64url')
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url')
}

function jsonEncode(obj: object): string {
  return base64urlEncode(JSON.stringify(obj))
}

function jsonDecode<T>(str: string): T {
  return JSON.parse(base64urlDecode(str).toString())
}

// Key management - in production, private key is stored in OS keychain via Electron safeStorage
// For the gateway process, we accept the private key as a parameter (loaded by Electron main)
let signingKeyPair: { privateKey: KeyObject; publicKey: KeyObject; kid: string } | null = null

export function initializeSigningKey(privateKeyB64?: string, keyId = 'gateway-key-1'): { privateKey: KeyObject; publicKey: KeyObject; kid: string } {
  if (privateKeyB64) {
    // Load existing key from safeStorage
    const privateKey = createPrivateKey({
      key: Buffer.from(privateKeyB64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    })
    const publicKey = createPublicKey(privateKey)
    signingKeyPair = { privateKey, publicKey, kid: keyId }
  } else {
    // Generate new key pair (for first run / CI)
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    signingKeyPair = { privateKey, publicKey, kid: keyId }
  }
  return signingKeyPair
}

export function getSigningKeyPair(): { privateKey: KeyObject; publicKey: KeyObject; kid: string } | null {
  return signingKeyPair
}

export function exportPrivateKeyBase64(): string | null {
  if (!signingKeyPair) return null
  return signingKeyPair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
}

export function exportPublicKeyBase64(): string | null {
  if (!signingKeyPair) return null
  return signingKeyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
}

// Token creation
export function createSessionToken(identity: Identity, permissions: TokenClaims['permissions'], config: GatewayConfig): string {
  if (!signingKeyPair) {
    throw new Error('Signing key not initialized')
  }

  const now = Math.floor(Date.now() / 1000)
  const exp = Math.floor((Date.now() + config.sessionTtlMs) / 1000)

  const header: TokenHeader = { alg: 'EdDSA', typ: 'JWT', kid: signingKeyPair.kid }
  const payload: TokenClaims = {
    sub: `${identity.user}@${identity.tailnet}`,
    deviceId: identity.deviceId,
    iat: now,
    exp,
    permissions,
  }

  const encodedHeader = jsonEncode(header)
  const encodedPayload = jsonEncode(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signature = sign(null, Buffer.from(signingInput), signingKeyPair.privateKey)

  return `${signingInput}.${base64urlEncode(signature)}`
}

// Token verification
export interface VerifiedToken {
  claims: TokenClaims
  header: TokenHeader
}

export function verifySessionToken(token: string, revokedTokens: RevokedTokenRepository): VerifiedToken {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Decode header to get key ID
  const header = jsonDecode<TokenHeader>(encodedHeader)
  if (header.alg !== 'EdDSA' || header.typ !== 'JWT') {
    throw new Error('Invalid token header')
  }

  // Check key ID matches
  if (!signingKeyPair || signingKeyPair.kid !== header.kid) {
    throw new Error('Key ID mismatch')
  }

  // Verify signature
  const signature = base64urlDecode(encodedSignature)
  const valid = verify(null, Buffer.from(signingInput), signingKeyPair.publicKey, signature)
  if (!valid) {
    throw new Error('Invalid signature')
  }

  // Decode and validate payload
  const claims = jsonDecode<TokenClaims>(encodedPayload)
  const now = Math.floor(Date.now() / 1000)

  if (claims.exp < now) {
    throw new Error('Token expired')
  }
  if (claims.iat > now + 60) {
    throw new Error('Token issued in the future')
  }

  // Check revocation
  const tokenHash = hashToken(token)
  if (revokedTokens.isRevoked(tokenHash)) {
    throw new Error('Token revoked')
  }

  return { claims, header }
}

function hashToken(token: string): string {
  // Simple SHA-256 hash for revocation list
  return createHash('sha256').update(token).digest('hex')
}

// Token revocation
export function revokeToken(token: string, revokedTokens: RevokedTokenRepository, reason?: string): void {
  const tokenHash = hashToken(token)
  revokedTokens.revoke(tokenHash, reason)
}

// Extract permissions from token for policy evaluation
export function getPermissionsFromToken(token: string, revokedTokens: RevokedTokenRepository): TokenClaims['permissions'] | null {
  try {
    const { claims } = verifySessionToken(token, revokedTokens)
    return claims.permissions
  } catch {
    return null
  }
}

// Parse token without verification (for debugging)
export function parseTokenUnverified(token: string): { header: TokenHeader; payload: TokenClaims } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return {
      header: jsonDecode<TokenHeader>(parts[0]),
      payload: jsonDecode<TokenClaims>(parts[1]),
    }
  } catch {
    return null
  }
}