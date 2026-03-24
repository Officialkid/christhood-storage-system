import { createHmac }      from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt               from 'bcryptjs'
import { prisma }           from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 10 * 60 * 1000 // 10 minutes

// In-memory attempt tracker (process-local; sufficient for single-replica deployments)
// key: `${galleryId}:${clientIp}`   value: { attempts: number; lockedUntil?: number }
const attemptMap = new Map<string, { attempts: number; lockedUntil?: number }>()

export async function POST(req:     NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
               ?? req.headers.get('x-real-ip')
               ?? '127.0.0.1'
  const key = `${galleryId}:${clientIp}`
  const now = Date.now()
  const slot = attemptMap.get(key) ?? { attempts: 0 }

  // Check lockout
  if (slot.lockedUntil && now < slot.lockedUntil) {
    const retryAfter = Math.ceil((slot.lockedUntil - now) / 1000)
    return NextResponse.json({ error: 'Too many attempts', retryAfter }, { status: 423 })
  }
  // Reset expired lockout
  if (slot.lockedUntil && now >= slot.lockedUntil) {
    slot.attempts    = 0
    slot.lockedUntil = undefined
  }

  // Parse body
  let password = ''
  try {
    const body = await req.json()
    password = String(body?.password ?? '').slice(0, 200) // sanity-limit input length
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  }

  // Fetch gallery (only the fields we need)
  const gallery = await prisma.publicGallery.findFirst({
    where:  { id: galleryId, isPasswordProtected: true },
    select: { id: true, passwordHash: true },
  })

  if (!gallery || !gallery.passwordHash) {
    // Don't reveal whether the gallery exists or has no password
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, gallery.passwordHash)

  if (!valid) {
    slot.attempts++
    if (slot.attempts >= MAX_ATTEMPTS) {
      slot.lockedUntil = now + LOCKOUT_MS
      slot.attempts    = 0
    }
    attemptMap.set(key, slot)
    const attemptsRemaining = MAX_ATTEMPTS - slot.attempts
    return NextResponse.json(
      { error: 'Incorrect password', attemptsRemaining },
      { status: 401 },
    )
  }

  // Clear attempt counter on success
  attemptMap.delete(key)

  // Issue a deterministic HMAC token bound to this gallery's ID.
  // Stored as an httpOnly cookie — the server verifies it on each request.
  const secret = process.env.NEXTAUTH_SECRET!
  const token = createHmac('sha256', secret).update(galleryId).digest('hex')

  const res = NextResponse.json({ success: true })
  res.cookies.set(`g_${galleryId}`, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30, // 30 days
    path:     '/',
  })
  return res
}
