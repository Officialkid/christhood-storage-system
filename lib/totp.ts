/**
 * lib/totp.ts
 *
 * TOTP helpers for two-factor authentication.
 *
 * Security design:
 *  - TOTP secrets are AES-256-GCM encrypted before storing in the DB.
 *    The encryption key comes from TOTP_ENCRYPTION_KEY (32-byte hex string).
 *  - Backup codes are stored as bcrypt hashes (cost 10).
 *  - Tokens are verified with a ±1 step window (tolerates 30-second clock skew).
 */

import { authenticator } from 'otplib'
import { toDataURL }     from 'qrcode'
import bcrypt            from 'bcryptjs'
import crypto            from 'crypto'

// ── Encryption setup ──────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES  = 12   // 96-bit IV recommended for GCM
const TAG_BYTES = 16   // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const hex = process.env.TOTP_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  const iv  = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Encode as  iv:tag:ciphertext  (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format')
  const [ivHex, tagHex, encHex] = parts
  const key       = getEncryptionKey()
  const iv        = Buffer.from(ivHex,  'hex')
  const tag       = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

// ── TOTP helpers ──────────────────────────────────────────────────────────────

// Allow 1 step either side (30 s window) to tolerate minor clock drift
authenticator.options = { window: 1 }

/** Generate a fresh base-32 TOTP secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20)  // 20-byte = 160-bit secret
}

/**
 * Build the otpauth:// URI used to create a QR code.
 * @param secret  Plain-text base-32 secret
 * @param email   User's email address (label shown in authenticator app)
 */
export function buildOtpAuthUri(secret: string, email: string): string {
  return authenticator.keyuri(email, 'Christhood CMMS', secret)
}

/**
 * Generate a QR code data URL from an otpauth:// URI.
 * Returns a PNG data URL safe to set as <img src="…">.
 */
export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return toDataURL(otpauthUri, { width: 256, margin: 1 })
}

/**
 * Verify a 6-digit TOTP token against the **plain-text** secret.
 * Returns true if the token is valid within the ±1 step window.
 */
export function verifyTotp(token: string, plainSecret: string): boolean {
  try {
    return authenticator.verify({ token, secret: plainSecret })
  } catch {
    return false
  }
}

// ── Backup codes ──────────────────────────────────────────────────────────────

const BACKUP_CODE_COUNT = 10

/** Generate 10 plain-text backup codes (shown to user once). */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    // 8 hex chars = 32 bits of entropy per code, formatted xxxx-xxxx
    crypto.randomBytes(4).toString('hex').slice(0, 4) + '-' +
    crypto.randomBytes(4).toString('hex').slice(0, 4),
  )
}

/** Hash backup codes for storage (bcrypt, cost 10). */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(c => bcrypt.hash(c, 10)))
}

/**
 * Check if a submitted code matches any stored hash.
 * Returns the index of the matched hash so the caller can remove it (one-time use).
 * Returns -1 if no match.
 */
export async function matchBackupCode(
  submitted: string,
  hashes: string[],
): Promise<number> {
  const results = await Promise.all(hashes.map(h => bcrypt.compare(submitted, h)))
  return results.findIndex(Boolean)
}
