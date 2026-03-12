/**
 * GET /api/auth/account-status?identifier=<email_or_username>
 *
 * Public endpoint (no session required) — called by the login page after a
 * failed signIn() to determine whether the failure was due to a locked account.
 *
 * Security notes:
 *  - Returns identical shape for non-existent users (locked: false, failedAttempts: 0)
 *    to prevent account enumeration via timing or response differences.
 *  - This endpoint is intentionally rate-limit-free: it is queried AFTER the
 *    credentials callback (which IS rate-limited) and adds no new attack surface.
 *  - Does NOT confirm whether an account exists.
 *
 * NOTE: This endpoint must NOT be used to bypass rate limiting — it only exposes
 * lockout status for UX purposes after an already-processed failed login attempt.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const identifier = req.nextUrl.searchParams.get('identifier')?.trim()

  if (!identifier) {
    return NextResponse.json({ locked: false, failedAttempts: 0 })
  }

  const user = await prisma.user.findFirst({
    where:  { OR: [{ email: identifier }, { username: identifier }] },
    select: { failedLoginAttempts: true, lockedUntil: true },
  }).catch(() => null)

  // Never confirm whether an account exists for non-existent identifiers
  if (!user) {
    return NextResponse.json({ locked: false, failedAttempts: 0 })
  }

  const now    = new Date()
  const locked = user.lockedUntil != null && user.lockedUntil > now

  return NextResponse.json({
    locked,
    lockedUntil:        locked ? user.lockedUntil!.toISOString() : null,
    failedAttempts:     user.failedLoginAttempts,
    minutesUntilUnlock: locked
      ? Math.ceil((user.lockedUntil!.getTime() - now.getTime()) / 60_000)
      : 0,
  })
}
