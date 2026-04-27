import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyEmailOtp } from '@/lib/emailOtp'
import { log } from '@/lib/activityLog'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { code?: string }
  const code = body.code?.trim()
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'A valid 6-digit code is required.' }, { status: 400 })
  }

  const valid = await verifyEmailOtp(session.user.id, 'enable', code)
  if (!valid.ok) {
    await log('TWO_FACTOR_OTP_VERIFY_FAILED', session.user.id, {
      metadata: { purpose: 'enable', reason: valid.error ?? 'INVALID_CODE' },
    })
    return NextResponse.json({ error: valid.error }, { status: 422 })
  }

  await log('TWO_FACTOR_OTP_VERIFY_SUCCESS', session.user.id, {
    metadata: { purpose: 'enable' },
  })

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  })

  return NextResponse.json({ ok: true })
}
