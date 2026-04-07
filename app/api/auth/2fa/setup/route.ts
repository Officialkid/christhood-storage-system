/**
 * POST /api/auth/2fa/setup
 *
 * Generates a fresh TOTP secret and returns the QR code data URL and the
 * plain-text secret (for manual entry).  The secret is NOT saved to the DB
 * yet — it is saved only once the user successfully verifies the first token
 * via POST /api/auth/2fa/enable.
 *
 * Auth required: valid session.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import {
  generateTotpSecret,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
} from '@/lib/totp'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { email: true, twoFactorEnabled: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA is already enabled.' }, { status: 409 })
  }

  const secret      = generateTotpSecret()
  const otpauthUri  = buildOtpAuthUri(secret, user.email!)
  const qrCodeUrl   = await generateQrCodeDataUrl(otpauthUri)

  return NextResponse.json({ secret, qrCodeUrl })
}
