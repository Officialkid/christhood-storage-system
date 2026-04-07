/**
 * POST /api/auth/2fa/disable
 *
 * Disables TOTP 2FA for the authenticated user.
 * Requires the user to confirm with their current password AND a valid TOTP token
 * (or backup code) to prevent an attacker who has only stolen the session cookie
 * from silently disabling 2FA.
 *
 * Auth required: valid session + valid 2fa_verified cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { verifyTotp, decryptSecret, matchBackupCode } from '@/lib/totp'
import { prisma } from '@/lib/prisma'
import bcrypt     from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { password?: string; code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { password, code } = body
  if (!password || !code) {
    return NextResponse.json({ error: 'password and code are required.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: {
      passwordHash:         true,
      twoFactorEnabled:     true,
      twoFactorSecret:      true,
      twoFactorBackupCodes: true,
    },
  })

  if (!user?.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA is not currently enabled.' }, { status: 400 })
  }

  // Verify password
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 422 })
  }

  // Verify TOTP or backup code
  const plainSecret = decryptSecret(user.twoFactorSecret!)
  const isTotp      = /^\d{6}$/.test(code.trim())

  if (isTotp) {
    if (!verifyTotp(code.trim(), plainSecret)) {
      return NextResponse.json({ error: 'Invalid authenticator code.' }, { status: 422 })
    }
  } else {
    const idx = await matchBackupCode(code.trim(), user.twoFactorBackupCodes)
    if (idx === -1) {
      return NextResponse.json({ error: 'Invalid backup code.' }, { status: 422 })
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data:  {
      twoFactorEnabled:     false,
      twoFactorSecret:      null,
      twoFactorBackupCodes: [],
    },
  })

  // Clear the 2fa_verified cookie
  const res = NextResponse.json({ ok: true })
  res.cookies.set('2fa_verified', '', { maxAge: 0, path: '/' })
  return res
}
