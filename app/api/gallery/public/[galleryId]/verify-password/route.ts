import { createHmac }      from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt               from 'bcryptjs'
import { prisma }           from '@/lib/prisma'

export async function POST(
  req:     NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

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
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

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
