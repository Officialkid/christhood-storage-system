/**
 * POST /api/admin/users/[id]/unlock
 *
 * Admin-only endpoint to manually unlock a user account that was locked
 * by the brute-force protection system (10 consecutive failed logins).
 *
 * Resets:
 *  - User.failedLoginAttempts → 0
 *  - User.lockedUntil         → null
 *
 * Logs: USER_UNLOCKED in ActivityLog.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { log }                        from '@/lib/activityLog'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
      data:  { failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true, username: true, email: true },
    })

    await log('USER_UNLOCKED', session.user.id, {
      metadata: { unlockedUserId: user.id, unlockedEmail: user.email },
    })

    return NextResponse.json({ ok: true, user })
  } catch (err) {
    console.error('[admin/users/unlock POST]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
