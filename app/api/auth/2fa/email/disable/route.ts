import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyEmailOtp } from '@/lib/emailOtp'
import bcrypt from 'bcryptjs'
import { log } from '@/lib/activityLog'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { code?: string; password?: string }
  const code = body.code?.trim()
  const password = body.password?.trim()

  if (!password || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Password and valid 6-digit code are required.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, twoFactorEnabled: true },
  })

  if (!user?.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA is not currently enabled.' }, { status: 400 })
  }

  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 422 })
  }

  const valid = await verifyEmailOtp(session.user.id, 'disable', code)
  if (!valid.ok) {
    await log('TWO_FACTOR_OTP_VERIFY_FAILED', session.user.id, {
      metadata: { purpose: 'disable', reason: valid.error ?? 'INVALID_CODE' },
    })
    return NextResponse.json({ error: valid.error }, { status: 422 })
  }

  await log('TWO_FACTOR_OTP_VERIFY_SUCCESS', session.user.id, {
    metadata: { purpose: 'disable' },
  })

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('2fa_verified', '', { maxAge: 0, path: '/' })
  return res
}
