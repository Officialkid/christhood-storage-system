/**
 * POST /api/auth/2fa/enable
 *
 * First-time enabling of TOTP 2FA.
 * The client sends the plain-text secret (from /setup) and the 6-digit token
 * the user entered from their authenticator app.
 *
 * On success:
 *  - Encrypts the secret and saves it to the DB.
 *  - Generates 10 backup codes, hashes them, saves hashes to DB.
 *  - Returns the plain-text backup codes (shown to user ONCE — never again).
 *
 * Auth required: valid session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import {
  verifyTotp,
  encryptSecret,
  generateBackupCodes,
  hashBackupCodes,
} from '@/lib/totp'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { secret?: string; token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { secret, token } = body
  if (!secret || !token) {
    return NextResponse.json({ error: 'secret and token are required.' }, { status: 400 })
  }

  // Validate secret looks like a base-32 string (basic sanity check)
  if (!/^[A-Z2-7]{32,}$/i.test(secret)) {
    return NextResponse.json({ error: 'Invalid secret format.' }, { status: 400 })
  }

  // Verify the TOTP token against the plain-text secret
  if (!verifyTotp(token, secret)) {
    return NextResponse.json({ error: 'Invalid authenticator code. Please try again.' }, { status: 422 })
  }

  const plainCodes  = generateBackupCodes()
  const hashedCodes = await hashBackupCodes(plainCodes)

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled:     true,
      twoFactorSecret:      encryptSecret(secret),
      twoFactorBackupCodes: hashedCodes,
    },
  })

  return NextResponse.json({ backupCodes: plainCodes })
}
