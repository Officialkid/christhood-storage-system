/**
 * GET /api/photo/auth/google
 *
 * Initiates Google OAuth for the Photo Gallery Platform.
 * Redirects the browser to Google's authorization endpoint.
 *
 * SETUP REQUIRED:
 *   Add "https://gallery.cmmschristhood.org/api/photo/auth/google/callback"
 *   as an Authorized Redirect URI in your Google Cloud Console OAuth 2.0 client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

const GALLERY_BASE   = process.env.GALLERY_BASE_URL ?? 'https://gallery.cmmschristhood.org'
const CALLBACK_URL   = `${GALLERY_BASE}/api/photo/auth/google/callback`
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured.' }, { status: 503 })
  }

  // CSRF state parameter — stored in a short-lived cookie
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  })

  // Where to redirect after login (passed via query param)
  const next = req.nextUrl.searchParams.get('next') ?? '/dashboard'

  const res = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)

  // Store state + next in a short-lived cookie for CSRF validation
  res.cookies.set('gp-oauth-state', JSON.stringify({ state, next }), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutes
    path:     '/',
  })

  return res
}
