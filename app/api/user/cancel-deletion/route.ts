import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

// ── POST /api/user/cancel-deletion ────────────────────────────────────────────
// Cancels a pending self-initiated account deletion within the 24-hour grace period.
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = token.id as string

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, pendingDeletionAt: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.pendingDeletionAt) {
    return NextResponse.json({ error: 'No pending deletion to cancel.' }, { status: 400 })
  }

  // Verify still within grace period (24 hours)
  const expiresAt = new Date(user.pendingDeletionAt.getTime() + 24 * 60 * 60 * 1000)
  if (new Date() >= expiresAt) {
    return NextResponse.json(
      { error: 'The grace period has passed. Please contact an administrator.' },
      { status: 410 },
    )
  }

  await prisma.user.update({
    where: { id: userId },
    data:  { pendingDeletionAt: null, pendingDeletionAction: null },
  })

  await log('ACCOUNT_DELETION_CANCELLED', userId, {})

  return NextResponse.json({ ok: true })
}
