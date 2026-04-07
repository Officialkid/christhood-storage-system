import { getToken }    from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { checkIpRateLimit } from '@/lib/rate-limit'

// ─────────────────────────────────────────────────────────────────────────────
// CSRF Origin verification
// For state-changing API requests (POST, PUT, PATCH, DELETE) we verify the
// Origin header matches the app's own origin.  This blocks cross-site requests
// even when the browser sends cookies, providing defense-in-depth on top of
// NextAuth's SameSite=Lax cookie protection.
//
// Exempt paths:
//   /api/auth/*  — NextAuth manages its own CSRF token for these
//   /api/cron/*  — machine-to-machine, no browser Origin
//   /api/health  — read-only probe
// ─────────────────────────────────────────────────────────────────────────────

const CSRF_EXEMPT_RE = /^\/api\/(?:auth|cron|health|gallery\/public|share\/[^/]+(?:\/download)?|public-share(?:\/|$))\b/
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function checkCsrfOrigin(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return true
  if (!req.nextUrl.pathname.startsWith('/api/')) return true
  if (CSRF_EXEMPT_RE.test(req.nextUrl.pathname)) return true

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  if (!appUrl) return true  // can't validate without known origin; fail open in dev

  let expectedOrigin: string
  try {
    expectedOrigin = new URL(appUrl).origin
  } catch {
    return true
  }

  const origin  = req.headers.get('origin')
  const referer = req.headers.get('referer')

  // A present Origin header must match exactly
  if (origin) return origin === expectedOrigin

  // Fallback: check Referer for older clients that omit Origin
  if (referer) {
    try { return new URL(referer).origin === expectedOrigin } catch { return false }
  }

  // No Origin/Referer on a mutating API call: reject (same-site browsers always send one)
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Approach 1 — CRLF injection protection
// Detects raw CR/LF bytes AND their percent-encoded forms (%0d %0a %0D %0A).
// ─────────────────────────────────────────────────────────────────────────────

/** Matches raw carriage-return/line-feed and both-case percent-encoded forms. */
const CRLF_RE = /[\r\n]|%0[da]/i

function hasCrlf(value: string): boolean {
  return CRLF_RE.test(value)
}

/**
 * Strip CRLF characters from a string before writing it into a response header.
 * Defence-in-depth: prevents CRLF in downstream data (e.g. DB content) from
 * leaking into response headers.
 */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]|%0[da]/gi, '')
}

// ── Security headers applied to every non-static response ────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security':  'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: blob:; " +
    "media-src 'self' https: blob:; " +
    "connect-src 'self' https://*.r2.cloudflarestorage.com https://generativelanguage.googleapis.com; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "form-action 'self'; " +
    "base-uri 'self'",
  'X-Frame-Options':            'DENY',
  'X-Content-Type-Options':     'nosniff',
  'X-XSS-Protection':           '1; mode=block',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Permissions-Policy':         'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
}

function applySecurityHeaders(res: NextResponse, pathname: string): NextResponse {
  // Skip static assets — no benefit, non-trivial overhead on every chunk request
  const isStaticAsset =
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/_next/image/')  ||
    pathname === '/favicon.ico'
  if (isStaticAsset) return res

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // stripCrlf applied as defence-in-depth (Approach 1 §4: sanitize response headers)
    res.headers.set(key, stripCrlf(value))
  }
  return res
}

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

// Paths that bypass session/RBAC enforcement.
// Auth routes are managed by NextAuth itself; health/cron are secured separately.
// /share/* and /api/share/[token]/GET are public (external sharing).
// /gallery-public/* and /api/gallery/public/* are the public gallery — no auth.
// All of these still go through the CRLF guard above.
const AUTH_PASSTHROUGH_RE =
  /^\/(?:login|signup|forgot-password|reset-password|privacy|terms|2fa|gallery-public(?:\/|$)|share(?:\/|$)|public-share(?:\/|$)|api\/auth|api\/health|api\/assistant\/health|api\/cron|api\/gallery\/public(?:\/|$)|api\/share(?:\/|$)|api\/public-share(?:\/|$))\b/

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const ip = extractIp(req)

  // ── Approach 1: CRLF injection guard — runs FIRST on every matched request ─
  //
  // NOTE: gallery subdomain rewrite (below) runs AFTER this check so that
  // CRLF protection still covers gallery subdomain requests.
  //
  // We test two representations:
  //   req.url     → raw URL string; percent-encoded forms (%0d %0a) are present
  //   pathname    → parsed by the URL API; may contain raw \r\n after decoding
  //
  // Both checks are needed to catch all encoding variants.
  if (hasCrlf(req.url) || hasCrlf(pathname)) {
    // Sanitize before logging to prevent log injection (strip raw CRLF bytes).
    const safeUrl = (pathname + search).replace(/[\r\n]/g, '').slice(0, 200)
    console.warn(`[security] CRLF injection attempt blocked: ${safeUrl} from IP: ${ip}`)
    // Return 400 with a generic body — do not reveal the specific detection reason.
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  // ── Gallery subdomain rewrite ─────────────────────────────────────────────
  // When the request comes from gallery.cmmschristhood.org (or gallery.localhost
  // for dev), internally rewrite to /gallery-public/* so the App Router serves
  // the public gallery layout without any auth checks.
  // API calls from the gallery frontend (/api/...) are NOT rewritten — they
  // route normally, but gallery/public/* is in AUTH_PASSTHROUGH_RE.
  const host = req.headers.get('host') ?? ''
  const isGalleryHost = host.startsWith('gallery.')
  if (
    isGalleryHost &&
    !pathname.startsWith('/gallery-public') &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/')
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/gallery-public' + (pathname === '/' ? '' : pathname)
    return applySecurityHeaders(NextResponse.rewrite(url), pathname)
  }

  // ── Public ShareLink subdomain rewrite ────────────────────────────────────
  // sharelink.cmmschristhood.org (or sharelink.localhost for dev) rewrites to
  // /public-share/* so external users land on the fully isolated upload/view
  // pages with zero access to the main CMMS app.
  // API calls (/api/*) and Next.js internals are NOT rewritten.
  const isSharelinkHost = host.startsWith('sharelink.')
  if (
    isSharelinkHost &&
    !pathname.startsWith('/public-share') &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/')
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/public-share' + (pathname === '/' ? '' : pathname)
    return applySecurityHeaders(NextResponse.rewrite(url), pathname)
  }

  // ── CSRF Origin check — blocks cross-site state-changing requests ──────────
  if (!checkCsrfOrigin(req)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      pathname,
    )
  }

  // ── Layer 1: IP rate-limit the credentials login endpoint ────────────────
  // This path is added to the matcher specifically for this check.
  // We return early here so it never reaches the session/RBAC logic below.
  if (pathname === '/api/auth/callback/credentials') {
    const rl = await checkIpRateLimit(ip)
    if (rl.limited) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'TooManyRequests', retryAfter: rl.retryAfter },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        ),
        pathname,
      )
    }
    return applySecurityHeaders(NextResponse.next(), pathname)
  }

  // ── Auth-passthrough paths: apply headers but skip session/RBAC ──────────
  // (These paths were previously excluded from the matcher; now they enter
  //  middleware for CRLF checking but must not be token-gated.)
  if (AUTH_PASSTHROUGH_RE.test(pathname)) {
    return applySecurityHeaders(NextResponse.next(), pathname)
  }

  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    })

    // ── Not authenticated → redirect to login ─────────
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
          pathname,
        )
      }
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return applySecurityHeaders(
        NextResponse.redirect(loginUrl),
        pathname,
      )
    }

    const role = token.role as string | undefined

    // ── 2FA gate ─────────────────────────────────────────────────────────────
    // If the JWT says requiresTwoFactor=true AND there is no valid 2fa_verified
    // cookie, hold the user on the /2fa challenge page.
    if (token.requiresTwoFactor) {
      const verifiedCookie = req.cookies.get('2fa_verified')?.value
      const is2faPage      = pathname === '/2fa'
      const is2faApi       = pathname.startsWith('/api/auth/2fa/')

      if (!verifiedCookie && !is2faPage && !is2faApi) {
        if (pathname.startsWith('/api/')) {
          return applySecurityHeaders(
            NextResponse.json({ error: 'Two-factor authentication required' }, { status: 403 }),
            pathname,
          )
        }
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/2fa', req.url)),
          pathname,
        )
      }
    }
    const isAdminPath =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api/admin')

    if (isAdminPath && role !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
          pathname,
        )
      }
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', req.url)),
        pathname,
      )
    }

    // ── Upload: ADMIN + UPLOADER + EDITOR ─────────────
    const isUploadPath =
      pathname.startsWith('/upload') ||
      pathname.startsWith('/api/upload')

    if (isUploadPath && !['ADMIN', 'UPLOADER', 'EDITOR'].includes(role ?? '')) {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
          pathname,
        )
      }
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', req.url)),
        pathname,
      )
    }

    return applySecurityHeaders(NextResponse.next(), pathname)
  } catch {
    // If anything crashes (e.g. missing secret on Edge runtime),
    // redirect to login rather than surfacing a 500.
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: [
    // Approach 1 + 2 (Vercel edge): Broadened matcher so CRLF protection runs
    // on ALL routes — including login, api/auth, api/health, api/cron — that
    // were previously excluded from session/RBAC checking.
    //
    // Only truly static delivery assets are excluded:
    //   /_next/static  — compiled JS/CSS chunks (never user-controlled data)
    //   /_next/image   — on-the-fly image optimisation responses
    //   /favicon.ico, /manifest.json, /icons/, /sw.js, workbox-*
    //     (service-worker + PWA assets, no CRLF risk)
    //
    // Auth-passthrough logic (previously the matcher exclusions) is now
    // enforced at runtime via AUTH_PASSTHROUGH_RE inside the middleware
    // function, keeping concerns cleanly separated.
    '/((?!_next/static|_next/image|favicon\.ico|manifest\.json|icons/|sw\.js|workbox-).*)',
  ],
}
