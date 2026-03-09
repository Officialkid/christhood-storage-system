import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    })

    const { pathname } = req.nextUrl

    // ── Not authenticated → redirect to login ─────────
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const role = token.role as string | undefined

    // ── Admin-only paths ──────────────────────────────
    const isAdminPath =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api/admin')

    if (isAdminPath && role !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // ── Upload: ADMIN + UPLOADER + EDITOR ─────────────
    const isUploadPath =
      pathname.startsWith('/upload') ||
      pathname.startsWith('/api/upload')

    if (isUploadPath && !['ADMIN', 'UPLOADER', 'EDITOR'].includes(role ?? '')) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  } catch {
    // If anything crashes (e.g. missing secret on Edge runtime),
    // redirect to login rather than surfacing a 500.
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: [
    // Exclude public/static routes that must be accessible without a session.
    // - login/signup/auth pages
    // - Next.js internals (_next/*)
    // - Static public assets: favicon, manifest.json, icons/, sw.js, workbox files
    '/((?!login|signup|forgot-password|reset-password|privacy|terms|api/auth|_next/static|_next/image|favicon\.ico|manifest\.json|icons/|sw\.js|workbox-).*)',
  ],
}
