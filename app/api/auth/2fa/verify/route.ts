/**
 * POST /api/auth/2fa/verify
 *
 * Called from the /2fa challenge page after a user logs in with credentials
 * but has 2FA enabled. Accepts either a 6-digit TOTP or an 8-char backup code.
 *
 * On success: sets an HttpOnly `2fa_verified` cookie (signed, 12-hour TTL)
 * that middleware checks to allow the session through.
 *
 * Auth required: valid NextAuth session (session exists but middleware is
 * holding the user on the challenge page).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { getToken }                  from 'next-auth/jwt'
import { authOptions }               from '@/lib/auth'
import { verifyTotp, decryptSecret, matchBackupCode } from '@/lib/totp'
import { prisma } from '@/lib/prisma'
import crypto     from 'crypto'

const COOKIE_NAME = '2fa_verified'
const COOKIE_TTL  = 60 * 60 * 12  // 12 hours in seconds

function signPayload(userId: string, secret: string): string {
  const payload   = `${userId}:${Date.now()}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return Buffer.from(`${payload}.${signature}`).toString('base64url')
}

export async function POST(req: NextRequest) {
  // Must have a valid session (credentials passed; only TOTP pending)
  const session = await getServerSession(authOptions)
  const token   = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!session?.user?.id || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // If 2FA isn't enabled, nothing to verify
  if (!token.requiresTwoFactor) {
    return NextResponse.json({ error: 'Two-factor authentication is not required.' }, { status: 400 })
  }

  let body: { code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { code } = body
  if (!code) return NextResponse.json({ error: 'code is required.' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorBackupCodes: true, twoFactorEnabled: true },
  })

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA is not set up for this account.' }, { status: 400 })
  }

  const plainSecret = decryptSecret(user.twoFactorSecret)
  const isTotp      = /^\d{6}$/.test(code.trim())

  if (isTotp) {
    if (!verifyTotp(code.trim(), plainSecret)) {
      return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 422 })
    }
  } else {
    // Backup code attempt
    const idx = await matchBackupCode(code.trim(), user.twoFactorBackupCodes)
    if (idx === -1) {
      return NextResponse.json({ error: 'Invalid backup code.' }, { status: 422 })
    }
    // Remove the used backup code (one-time use)
    const remaining = [...user.twoFactorBackupCodes]
    remaining.splice(idx, 1)
    await prisma.user.update({
      where: { id: session.user.id },
      data:  { twoFactorBackupCodes: remaining },
    })
  }

  // Sign a verification cookie so middleware knows this session passed 2FA
  const cookieSecret = process.env.NEXTAUTH_SECRET!
  const value = signPayload(session.user.id, cookieSecret)

  const isProd = process.env.NODE_ENV === 'production'
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   COOKIE_TTL,
    path:     '/',
  })
  return res
}
