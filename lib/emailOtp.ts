import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

type OtpPurpose = 'challenge' | 'enable' | 'disable'

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_GAP_MS = 30 * 1000
const MAX_ATTEMPTS = 6

function key(userId: string, purpose: OtpPurpose): string {
  return `2faotp:${purpose}:${userId}:`
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export function generateEmailOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function setEmailOtp(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
  const prefix = key(userId, purpose)
  const hashed = hashCode(code)

  await prisma.passwordResetToken.updateMany({
    where: { userId, used: false, token: { startsWith: prefix } },
    data: { used: true },
  })

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token: `${prefix}${hashed}`,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })
}

export async function canResendEmailOtp(userId: string, purpose: OtpPurpose): Promise<{ ok: boolean; retryAfterSec: number }> {
  const prefix = key(userId, purpose)
  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId, used: false, token: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (!latest) return { ok: true, retryAfterSec: 0 }

  const delta = Date.now() - latest.createdAt.getTime()
  if (delta >= RESEND_GAP_MS) return { ok: true, retryAfterSec: 0 }
  return { ok: false, retryAfterSec: Math.ceil((RESEND_GAP_MS - delta) / 1000) }
}

export async function verifyEmailOtp(userId: string, purpose: OtpPurpose, code: string): Promise<{ ok: boolean; error?: string }> {
  const prefix = key(userId, purpose)
  const row = await prisma.passwordResetToken.findFirst({
    where: { userId, used: false, token: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, token: true, expiresAt: true, createdAt: true },
  })

  if (!row) return { ok: false, error: 'No verification code found. Request a new code.' }

  if (row.expiresAt < new Date()) {
    await prisma.passwordResetToken.update({ where: { id: row.id }, data: { used: true } })
    return { ok: false, error: 'Verification code expired. Request a new one.' }
  }

  const failedCount = await prisma.activityLog.count({
    where: {
      userId,
      action: 'TWO_FACTOR_OTP_VERIFY_FAILED',
      createdAt: { gte: row.createdAt },
    },
  })

  if (failedCount >= MAX_ATTEMPTS) {
    await prisma.passwordResetToken.update({ where: { id: row.id }, data: { used: true } })
    return { ok: false, error: 'Too many invalid attempts. Request a new code.' }
  }

  const expectedHash = row.token.slice(prefix.length)
  const isMatch = hashCode(code.trim()) === expectedHash
  if (!isMatch) {
    if (failedCount + 1 >= MAX_ATTEMPTS) {
      await prisma.passwordResetToken.update({ where: { id: row.id }, data: { used: true } })
    }
    return { ok: false, error: 'Invalid verification code.' }
  }

  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { used: true } })
  return { ok: true }
}
