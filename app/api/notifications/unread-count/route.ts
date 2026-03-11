import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/notifications/unread-count
 * Returns the combined count of unread system notifications + unread messages.
 * Used by the bell badge — polled every 30 s by NotificationBell.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ count: 0 })

  const userId = session.user.id

  const [notifCount, msgCount] = await Promise.all([
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.messageRecipient.count({ where: { recipientId: userId, read: false } }),
  ])

  return NextResponse.json({ count: notifCount + msgCount })
}
