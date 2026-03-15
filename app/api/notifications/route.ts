import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/notifications
 * Returns a combined feed of system notifications and internal messages,
 * merged by recency and tagged with itemType: 'notification' | 'message'.
 * Messages include subject, senderName, and priority for distinct rendering.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const [rawNotifications, rawMessages, notifUnread, msgUnread, notifTotal] = await Promise.all([
    prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
    }),
    prisma.messageRecipient.findMany({
      where:   { recipientId: userId },
      include: {
        message: {
          select: {
            id:       true,
            subject:  true,
            priority: true,
            sender:   { select: { name: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.messageRecipient.count({ where: { recipientId: userId, read: false } }),
    prisma.notification.count({ where: { userId } }),
  ])

  const notifItems = rawNotifications.map((n) => ({
    id:       n.id,
    itemType: 'notification' as const,
    type:     n.type,
    title:    n.title || undefined,
    message:  n.message,
    link:     n.link,
    read:     n.read,
    createdAt: n.createdAt.toISOString(),
  }))

  const msgItems = rawMessages.map((mr) => {
    const senderName = mr.message.sender.name ?? mr.message.sender.username ?? 'Admin'
    return {
      id:         mr.message.id,
      itemType:   'message' as const,
      message:    `${senderName}: ${mr.message.subject}`,
      subject:    mr.message.subject,
      senderName,
      priority:   mr.message.priority as 'NORMAL' | 'URGENT',
      link:       `/messages/inbox/${mr.message.id}`,
      read:       mr.read,
      createdAt:  mr.createdAt.toISOString(),
    }
  })

  // Merge-sort both feeds by date desc, return at most `limit` items
  const notifications = [...notifItems, ...msgItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)

  const unreadCount = notifUnread + msgUnread
  const total       = notifTotal

  return NextResponse.json({ notifications, unreadCount, total, page, limit })
}
