import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createGalleryToken, setSessionCookie } from '@/lib/photo-gallery/session'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const user = await prisma.photoUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user || !user.passwordHash) {
      // Generic error to avoid email enumeration
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Your account has been deactivated.' }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const token = await createGalleryToken({
      userId:      user.id,
      username:    user.username,
      email:       user.email,
      displayName: user.displayName,
      planTier:    user.planTier,
      isSuperAdmin: user.isSuperAdmin,
      avatarUrl:   user.avatarUrl,
    })

    const res = NextResponse.json({
      user: {
        id:          user.id,
        username:    user.username,
        displayName: user.displayName,
        planTier:    user.planTier,
        isSuperAdmin: user.isSuperAdmin,
      },
    })
    setSessionCookie(res, token)
    return res
  } catch (err) {
    console.error('[photo/auth/login]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
