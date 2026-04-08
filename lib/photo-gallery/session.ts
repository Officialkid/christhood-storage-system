/**
 * lib/photo-gallery/session.ts
 *
 * JWT utilities for the Photo Gallery Platform.
 * Uses jose (available as a next-auth dependency) to sign/verify tokens.
 * Cookie: "gp-session" — separate from the CMMS "next-auth.session-token" cookie.
 */

import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'

export const GP_COOKIE = 'gp-session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret() {
  const raw = process.env.NEXTAUTH_SECRET
  if (!raw) throw new Error('NEXTAUTH_SECRET not set')
  return new TextEncoder().encode(raw)
}

export interface GallerySession {
  userId:      string
  username:    string
  email:       string
  displayName: string
  planTier:    'FREE' | 'PREMIUM'
  isSuperAdmin: boolean
  avatarUrl:   string | null
}

export async function createGalleryToken(session: GallerySession): Promise<string> {
  return new SignJWT({ ...(session as unknown as Record<string, unknown>) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret())
}

export async function decodeGalleryToken(token: string): Promise<GallerySession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload.userId) return null
    return payload as unknown as GallerySession
  } catch {
    return null
  }
}

export async function getGallerySession(req: NextRequest): Promise<GallerySession | null> {
  const token = req.cookies.get(GP_COOKIE)?.value
  if (!token) return null
  return decodeGalleryToken(token)
}

/** Read gallery session in a Next.js server component or server action */
export async function getGallerySessionServer(): Promise<GallerySession | null> {
  const { cookies } = await import('next/headers')
  const store = await cookies()
  const token = store.get(GP_COOKIE)?.value
  if (!token) return null
  return decodeGalleryToken(token)
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(GP_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   MAX_AGE,
    path:     '/',
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(GP_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,
    path:     '/',
  })
}
