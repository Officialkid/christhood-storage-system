/**
 * POST /api/transfers/[transferId]/verify-pin
 * Verifies the PIN for a PIN-protected transfer.
 * Only the transfer recipient may call this endpoint.
 *
 * Rate limiting: 5 failed attempts per (transferId + userId) → 10-minute lockout
 * On success: sets an httpOnly cookie containing an HMAC token (24-hour expiry)
 *
 * Body: { pin: string }
 * Returns:
 *   200 { valid: true }
 *   401 { error: 'Unauthenticated' }
 *   403 { error: 'Forbidden' }
 *   404 { error: 'Not found' }
 *   422 { valid: false, attemptsRemaining: number }
 *   423 { error: 'Too many attempts', retryAfter: number }   // seconds until unlock
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { createHmac }                from 'crypto'
import bcrypt                        from 'bcryptjs'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 10 * 60 * 1000 // 10 minutes

// In-memory attempt tracker (process-local; sufficient for single-replica deployments)
// key: `${transferId}:${userId}`   value: { attempts: number; lockedUntil?: number }
const attemptMap = new Map<string, { attempts: number; lockedUntil?: number }>()

export async function POST(req: NextRequest, props: { params: Promise<{ transferId: string }> }) {
  const params = await props.params;
  const { transferId } = params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  const userId = session.user.id

  // Fetch transfer — only the recipient may verify
  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { id: true, recipientId: true, isPinProtected: true, pin: true },
  })
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (transfer.recipientId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!transfer.isPinProtected || !transfer.pin) {
    // Transfer is not PIN-protected; return success immediately
    return NextResponse.json({ valid: true })
  }

  const key  = `${transferId}:${userId}`
  const now  = Date.now()
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
  let pin: string
  try {
    const body = await req.json()
    pin = String(body?.pin ?? '')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })
  }

  const valid = await bcrypt.compare(pin, transfer.pin)

  if (valid) {
    // Clear attempt counter on success
    attemptMap.delete(key)

    // Issue a short-lived httpOnly verification cookie
    const secret = process.env.NEXTAUTH_SECRET ?? 'secret'
    const token  = createHmac('sha256', secret)
      .update(`${transferId}:${userId}`)
      .digest('hex')

    const res = NextResponse.json({ valid: true })
    res.cookies.set(`tp_${transferId}`, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   24 * 60 * 60, // 24 hours
    })
    return res
  }

  // Wrong PIN — increment attempts
  slot.attempts += 1
  if (slot.attempts >= MAX_ATTEMPTS) {
    slot.lockedUntil = now + LOCKOUT_MS
  }
  attemptMap.set(key, slot)

  const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - slot.attempts)
  return NextResponse.json({ valid: false, attemptsRemaining }, { status: 422 })
}
