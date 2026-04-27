import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canResendEmailOtp, generateEmailOtpCode, setEmailOtp } from '@/lib/emailOtp'
import { sendTwoFactorOtpEmail } from '@/lib/email'
import { log } from '@/lib/activityLog'

type Purpose = 'challenge' | 'enable' | 'disable'

function isPurpose(v: string): v is Purpose {
  return v === 'challenge' || v === 'enable' || v === 'disable'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let purpose: Purpose = 'challenge'
  try {
    const body = await req.json().catch(() => ({})) as { purpose?: string }
    if (body?.purpose && isPurpose(body.purpose)) purpose = body.purpose
  } catch {
    // ignore malformed body; default purpose is used
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, twoFactorEnabled: true },
  })
  if (!user?.email) {
    return NextResponse.json({ error: 'User email not found.' }, { status: 404 })
  }

  if (purpose === 'enable' && user.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA is already enabled.' }, { status: 409 })
  }

  if ((purpose === 'challenge' || purpose === 'disable') && !user.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA is not enabled for this account.' }, { status: 400 })
  }

  const resend = await canResendEmailOtp(session.user.id, purpose)
  if (!resend.ok) {
    await log('TWO_FACTOR_OTP_VERIFY_FAILED', session.user.id, {
      metadata: { purpose, reason: 'RATE_LIMIT', retryAfterSec: resend.retryAfterSec },
    })
    return NextResponse.json(
      { error: `Please wait ${resend.retryAfterSec}s before requesting another code.` },
      { status: 429 },
    )
  }

  const code = generateEmailOtpCode()
  await setEmailOtp(session.user.id, purpose, code)
  await sendTwoFactorOtpEmail({ toEmail: user.email, code, minutes: 10 })
  await log('TWO_FACTOR_OTP_SENT', session.user.id, {
    metadata: { purpose, channel: 'email' },
  })

  return NextResponse.json({ ok: true })
}
