/**
 * Password hashing for local app profiles using PBKDF2-SHA256 via the Web Crypto API.
 *
 * Each password gets a random salt and a configurable work factor. Hashes are stored in a
 * self-describing string (`pbkdf2$iterations$salt$hash`) so the scheme can evolve later.
 * This protects the app-local profile only; it is not gateway authentication.
 */

const SCHEME = 'pbkdf2'
const DEFAULT_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256

/** Encode raw bytes as base64 text for storage. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Decode base64 text back into raw bytes. */
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Derive a base64 PBKDF2-SHA256 hash for the given password and salt. */
async function deriveHash(password: string, salt: BufferSource, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return bytesToBase64(new Uint8Array(bits))
}

/** Compare two strings without leaking length or content through early exits. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/** True when the stored value is a PBKDF2 hash produced by `hashPassword`. */
export function isPasswordHash(value: string): boolean {
  const parts = value.split('$')
  return (
    parts.length === 4 &&
    parts[0] === SCHEME &&
    Number.isInteger(Number(parts[1])) &&
    Number(parts[1]) > 0
  )
}

/** Hash a password with a fresh random salt, returning a storable self-describing string. */
export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt, iterations)
  return [SCHEME, iterations, bytesToBase64(salt), hash].join('$')
}

/**
 * Verify a password against a stored hash.
 *
 * Legacy plaintext values (stored before hashing was introduced) are compared directly so
 * existing accounts keep working; callers can then re-hash and persist the upgraded value.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isPasswordHash(stored)) return constantTimeEqual(stored, password)
  const [, iterations, salt, expected] = stored.split('$')
  const actual = await deriveHash(password, base64ToBytes(salt), Number(iterations))
  return constantTimeEqual(actual, expected)
}
