/**
 * POST /api/auth/2fa/backup-codes/regenerate
 *
 * Generates a fresh set of 10 backup codes, replacing all existing ones.
 * Requires a valid TOTP token to prevent misuse.
 *
 * Returns the plain-text codes (shown once — user must save them).
 *
 * Auth required: valid session + valid 2fa_verified cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import {
  verifyTotp,
  decryptSecret,
  generateBackupCodes,
  hashBackupCodes,
} from '@/lib/totp'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { token } = body
  if (!token) return NextResponse.json({ error: 'token is required.' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  })

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA is not enabled.' }, { status: 400 })
  }

  const plainSecret = decryptSecret(user.twoFactorSecret)
  if (!verifyTotp(token.trim(), plainSecret)) {
    return NextResponse.json({ error: 'Invalid authenticator code.' }, { status: 422 })
  }

  const plainCodes  = generateBackupCodes()
  const hashedCodes = await hashBackupCodes(plainCodes)

  await prisma.user.update({
    where: { id: session.user.id },
    data:  { twoFactorBackupCodes: hashedCodes },
  })

  return NextResponse.json({ backupCodes: plainCodes })
}
