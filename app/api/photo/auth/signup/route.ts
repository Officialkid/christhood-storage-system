import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createGalleryToken, setSessionCookie } from '@/lib/photo-gallery/session'

const SUPER_ADMIN_EMAIL = 'danielmwaliliofficial@gmail.com'
const PREMIUM_EMAIL     = 'christhoodmedia3@gmail.com'
const RESERVED_USERNAMES = new Set([
  'login', 'signup', 'logout', 'dashboard', 'settings', 'admin',
  'u', 's', 'api', 'help', 'about', 'terms', 'privacy',
])

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, displayName, email, password } = body as {
      username: string; displayName: string; email: string; password: string
    }

    // ── Validation ────────────────────────────────────────────────────────
    if (!username || !displayName || !email || !password) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }

    const slugifiedUsername = toSlug(username)
    if (slugifiedUsername.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters (letters and numbers only).' },
        { status: 400 },
      )
    }
    if (RESERVED_USERNAMES.has(slugifiedUsername)) {
      return NextResponse.json({ error: 'That username is reserved.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const emailLower = email.toLowerCase().trim()

    // ── Uniqueness checks ─────────────────────────────────────────────────
    const [existingEmail, existingUsername] = await Promise.all([
      prisma.photoUser.findUnique({ where: { email: emailLower }, select: { id: true } }),
      prisma.photoUser.findUnique({ where: { username: slugifiedUsername }, select: { id: true } }),
    ])
    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }
    if (existingUsername) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, 12)

    const isSuperAdmin = emailLower === SUPER_ADMIN_EMAIL
    const isPremium    = isSuperAdmin || emailLower === PREMIUM_EMAIL

    const user = await prisma.photoUser.create({
      data: {
        username:    slugifiedUsername,
        displayName: displayName.trim().slice(0, 60),
        email:       emailLower,
        passwordHash: hash,
        isSuperAdmin,
        planTier:         isPremium ? 'PREMIUM' : 'FREE',
        storageLimitBytes: isPremium ? BigInt('107374182400') : BigInt('5368709120'), // 100GB premium, 5GB free
      },
    })

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
        email:       user.email,
        planTier:    user.planTier,
        isSuperAdmin: user.isSuperAdmin,
      },
    })
    setSessionCookie(res, token)
    return res
  } catch (err) {
    console.error('[photo/auth/signup]', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
