import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'
import { logger }           from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, email, phone, password } = body

    // ── Validation ────────────────────────────────────────────
    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Username, email and password are required.' },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters (letters, numbers, underscores only).' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    // ── Uniqueness checks ─────────────────────────────────────
    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findFirst({ where: { username } }),
    ])

    if (existingEmail) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }
    if (existingUsername) {
      return NextResponse.json(
        { error: 'This username is already taken.' },
        { status: 409 }
      )
    }

    // ── Create user ───────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        username,
        email,
        phone:        phone ?? null,
        passwordHash,
        role:         'UPLOADER',
      },
      select: { id: true, username: true, email: true, role: true },
    })

    // Non-fatal welcome email
    sendWelcomeEmail(user.email, user.username ?? user.email)
      .catch(e => logger.warn('REGISTER_SIDE_EFFECT_FAILED', { route: '/api/auth/register', error: (e as Error)?.message, message: 'sendWelcomeEmail failed' }))

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    logger.error('USER_CREATED_FAILED', { route: '/api/auth/register', error: (err as Error)?.message, errorCode: (err as any)?.code, message: 'User registration failed' })
    return handleApiError(err)
  }
}
