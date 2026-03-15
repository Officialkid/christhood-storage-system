import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/

// ── GET /api/user/username?q=<candidate> ─────────────────────────────────────
// Real-time availability check — called while the user types (debounced).
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (!q)              return NextResponse.json({ available: false, reason: 'Username is required' })
  if (q.length < 3)    return NextResponse.json({ available: false, reason: 'Too short (min 3 characters)' })
  if (q.length > 20)   return NextResponse.json({ available: false, reason: 'Too long (max 20 characters)' })
  if (!USERNAME_REGEX.test(q))
                       return NextResponse.json({ available: false, reason: 'Letters, numbers, _ and – only' })

  // Ensure the candidate is not another user's email address
  const asEmail = await prisma.user.findFirst({
    where:  { email: { equals: q, mode: 'insensitive' }, NOT: { id: token.id as string } },
    select: { id: true },
  })
  if (asEmail) return NextResponse.json({ available: false, reason: 'Username not available' })

  // Check uniqueness excluding the requesting user (they can keep the same username)
  const conflict = await prisma.user.findFirst({
    where:  { username: { equals: q, mode: 'insensitive' }, NOT: { id: token.id as string } },
    select: { id: true },
  })

  return NextResponse.json({
    available: !conflict,
    reason:    conflict ? 'Username already taken' : undefined,
  })
}

// ── PATCH /api/user/username ──────────────────────────────────────────────────
// Saves a new username after passing format + uniqueness validation.
export async function PATCH(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { newUsername?: unknown }
  try   { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const raw = typeof body.newUsername === 'string' ? body.newUsername.trim() : ''

  if (!raw)           return NextResponse.json({ error: 'newUsername is required' },                            { status: 400 })
  if (raw.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' },             { status: 400 })
  if (raw.length > 20)return NextResponse.json({ error: 'Username must be 20 characters or fewer' },            { status: 400 })
  if (!USERNAME_REGEX.test(raw))
                      return NextResponse.json({ error: 'Letters, numbers, underscores and hyphens only' },     { status: 400 })

  // Not another user's email
  const asEmail = await prisma.user.findFirst({
    where:  { email: { equals: raw, mode: 'insensitive' }, NOT: { id: token.id as string } },
    select: { id: true },
  })
  if (asEmail) return NextResponse.json({ error: 'Username not available' }, { status: 409 })

  // Unique among usernames
  const conflict = await prisma.user.findFirst({
    where:  { username: { equals: raw, mode: 'insensitive' }, NOT: { id: token.id as string } },
    select: { id: true },
  })
  if (conflict) return NextResponse.json({ error: 'Username already taken' }, { status: 409 })

  const oldUser = await prisma.user.findUnique({
    where:  { id: token.id as string },
    select: { username: true },
  })

  const updated = await prisma.user.update({
    where:  { id: token.id as string },
    data:   { username: raw },
    select: { id: true, username: true },
  })

  await log('PROFILE_UPDATED', token.id as string, {
    metadata: { field: 'username', oldValue: oldUser?.username ?? '', newValue: raw },
  })

  return NextResponse.json({ username: updated.username })
}
