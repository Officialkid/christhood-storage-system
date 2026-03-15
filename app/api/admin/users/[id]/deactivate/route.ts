import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

// ── POST /api/admin/users/[id]/deactivate ──────────────────────
// Body: { action: 'deactivate' | 'reactivate' }
// Deactivating forces an immediate logout by destroying all active sessions.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminId  = session.user.id
  const targetId = params.id

  if (targetId === adminId) {
    return NextResponse.json(
      { error: 'You cannot deactivate your own account.' },
      { status: 400 }
    )
  }

  const { action } = await req.json()
  if (action !== 'deactivate' && action !== 'reactivate') {
    return NextResponse.json({ error: 'action must be "deactivate" or "reactivate".' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } })
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  try {
    if (action === 'deactivate') {
      await prisma.$transaction([
        // Force logout: destroy all active NextAuth sessions
        prisma.session.deleteMany({ where: { userId: targetId } }),
        // Mark as inactive
        prisma.user.update({
          where: { id: targetId },
          data: {
            isActive:        false,
            deactivatedAt:   new Date(),
            deactivatedById: adminId,
          },
        }),
      ])

      await log('USER_DEACTIVATED', adminId, {
        metadata: { targetUserId: targetId, targetEmail: target.email },
      })
    } else {
      await prisma.user.update({
        where: { id: targetId },
        data: {
          isActive:        true,
          deactivatedAt:   null,
          deactivatedById: null,
        },
      })

      await log('USER_REACTIVATED', adminId, {
        metadata: { targetUserId: targetId, targetEmail: target.email },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, 'admin/users/deactivate')
  }
}
