import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return success to prevent user enumeration
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data:  { used: true },
    })

    // Create new token (expires in 24 h)
    const token     = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    await sendPasswordResetEmail(
      user.email,
      user.username ?? user.email,
      token
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[forgot-password]', err)
    return handleApiError(err)
  }
}
