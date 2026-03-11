import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * POST /api/notifications/mark-all-read
 * Marks all unread system notifications AND unread message recipients as read.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const [notifResult, msgResult] = await Promise.all([
    prisma.notification.updateMany({
      where: { userId, read: false },
      data:  { read: true },
    }),
    prisma.messageRecipient.updateMany({
      where: { recipientId: userId, read: false },
      data:  { read: true, readAt: new Date() },
    }),
  ])

  return NextResponse.json({ ok: true, count: notifResult.count + msgResult.count })
}
