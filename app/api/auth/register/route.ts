import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'
import { logger }           from '@/lib/logger'
import { checkRegisterRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? req.headers.get('x-real-ip')
            ?? '127.0.0.1'
    const rl = await checkRegisterRateLimit(ip)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

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

    if (existingEmail || existingUsername) {
      return NextResponse.json(
        { error: 'An account with these details already exists.' },
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
