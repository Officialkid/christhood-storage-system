import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = req.nextauth.token?.role as string | undefined

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
  },
  {
    callbacks: {
      // Must be authenticated for ALL protected routes
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    '/((?!login|signup|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon\.ico).*)'
  ],
}
