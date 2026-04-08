/**
 * GET /api/photo/auth/google/callback
 *
 * Handles the Google OAuth callback for the Photo Gallery Platform.
 * Creates a new PhotoUser on first login, then issues a gp-session JWT cookie.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createGalleryToken, setSessionCookie } from '@/lib/photo-gallery/session'

const GALLERY_BASE  = process.env.GALLERY_BASE_URL ?? 'https://gallery.cmmschristhood.org'
const CALLBACK_URL  = `${GALLERY_BASE}/api/photo/auth/google/callback`
const SUPER_ADMIN_EMAIL = 'danielmwaliliofficial@gmail.com'
const PREMIUM_EMAIL     = 'christhoodmedia3@gmail.com'

function usernameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 28)
}

async function makeUniqueUsername(base: string): Promise<string> {
  let candidate = base.length < 3 ? `user${base}` : base
  let attempt   = 0
  while (attempt < 20) {
    const existing = await prisma.photoUser.findUnique({
      where: { username: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
    attempt++
    candidate = `${base}${attempt}`
  }
  return `${base}${Date.now()}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const galleryBase = GALLERY_BASE

  if (errorParam) {
    return NextResponse.redirect(`${galleryBase}/login?error=google_denied`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${galleryBase}/login?error=google_missing_params`)
  }

  // CSRF — validate state cookie
  const stateCookie = req.cookies.get('gp-oauth-state')?.value
  if (!stateCookie) {
    return NextResponse.redirect(`${galleryBase}/login?error=google_state_missing`)
  }

  let cookieData: { state: string; next: string }
  try {
    cookieData = JSON.parse(stateCookie)
  } catch {
    return NextResponse.redirect(`${galleryBase}/login?error=google_state_invalid`)
  }

  if (cookieData.state !== state) {
    return NextResponse.redirect(`${galleryBase}/login?error=google_state_mismatch`)
  }

  const nextPath = cookieData.next ?? '/dashboard'

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  CALLBACK_URL,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[photo/auth/google/callback] token exchange failed', await tokenRes.text())
    return NextResponse.redirect(`${galleryBase}/login?error=google_token_failed`)
  }

  const tokens = await tokenRes.json() as { access_token: string }

  // Fetch user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!profileRes.ok) {
    return NextResponse.redirect(`${galleryBase}/login?error=google_profile_failed`)
  }

  const profile = await profileRes.json() as {
    id: string; email: string; name: string; picture: string
  }

  const emailLower = profile.email.toLowerCase()

  // Find or create PhotoUser
  let user = await prisma.photoUser.findFirst({
    where: { OR: [{ googleId: profile.id }, { email: emailLower }] },
  })

  if (user) {
    // Update googleId and avatar if new
    if (!user.googleId || user.avatarUrl !== profile.picture) {
      user = await prisma.photoUser.update({
        where: { id: user.id },
        data:  {
          googleId:  user.googleId ?? profile.id,
          avatarUrl: profile.picture,
        },
      })
    }
  } else {
    // New user — create account
    const isSuperAdmin = emailLower === SUPER_ADMIN_EMAIL
    const isPremium    = isSuperAdmin || emailLower === PREMIUM_EMAIL
    const baseUsername = usernameFromEmail(emailLower)
    const username     = await makeUniqueUsername(baseUsername)

    user = await prisma.photoUser.create({
      data: {
        username,
        displayName: profile.name || username,
        email:       emailLower,
        googleId:    profile.id,
        avatarUrl:   profile.picture,
        isSuperAdmin,
        planTier:          isPremium ? 'PREMIUM' : 'FREE',
        storageLimitBytes: isPremium ? BigInt('107374182400') : BigInt('5368709120'),
      },
    })
  }

  if (!user.isActive) {
    return NextResponse.redirect(`${galleryBase}/login?error=account_deactivated`)
  }

  const jwt = await createGalleryToken({
    userId:      user.id,
    username:    user.username,
    email:       user.email,
    displayName: user.displayName,
    planTier:    user.planTier,
    isSuperAdmin: user.isSuperAdmin,
    avatarUrl:   user.avatarUrl,
  })

  const redirectUrl = nextPath.startsWith('/')
    ? `${galleryBase}${nextPath}`
    : `${galleryBase}/dashboard`

  const res = NextResponse.redirect(redirectUrl)

  // Clear state cookie
  res.cookies.set('gp-oauth-state', '', { maxAge: 0, path: '/' })

  setSessionCookie(res, jwt)
  return res
}
