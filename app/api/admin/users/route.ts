import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendAccountCreatedEmail } from '@/lib/email'

// ── GET /api/admin/users ── list all users ────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      username:      true,
      name:          true,
      email:         true,
      phone:         true,
      role:          true,
      image:         true,
      createdAt:     true,
      isActive:      true,
      deactivatedAt: true,
    },
  })

  return NextResponse.json({ users })
}

// ── POST /api/admin/users ── create a user (admin only) ───────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { username, email, phone, password, role } = await req.json()

    if (!username || !email || !password || !role) {
      return NextResponse.json(
        { error: 'username, email, password and role are required.' },
        { status: 400 }
      )
    }

    const validRoles = ['ADMIN', 'UPLOADER', 'EDITOR']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }

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

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { username, email, phone: phone ?? null, passwordHash, role },
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    })

    // Generate a "set your password" token and email the new user
    const setPasswordToken = crypto.randomBytes(32).toString('hex')
    await prisma.passwordResetToken.create({
      data: {
        token:     setPasswordToken,
        userId:    user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })
    // Non-fatal — email failure must not prevent account creation
    sendAccountCreatedEmail(user.email, user.username ?? user.email, user.role, setPasswordToken)
      .catch(e => console.error('[admin/users] sendAccountCreatedEmail failed:', e))

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    console.error('[admin/users POST]', err)
    return handleApiError(err)
  }
}
