import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/communications/counts
 * Returns badge counts for the Communications nav item.
 *  - transfersCount: for non-admin = PENDING incoming transfers,
 *                    for admin    = RESPONDED transfers (awaiting admin action)
 *  - messagesCount:  unread messages for the current user
 *  - hasUrgent:      true if any unread URGENT messages exist
 *  - totalTransfers: total number of transfers the user is involved in
 *    (used to detect "truly empty" state for non-admin users)
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({
      transfersCount: 0,
      messagesCount:  0,
      hasUrgent:      false,
      totalTransfers: 0,
    })
  }

  const userId = session.user.id

  const [messagesCount, pendingIncoming, respondedOutgoing, urgentCount, totalTransfers] = await Promise.all([
    prisma.messageRecipient.count({
      where: { recipientId: userId, read: false },
    }),
    prisma.transfer.count({
      where: { recipientId: userId, senderId: { not: userId }, status: 'PENDING' },
    }),
    prisma.transfer.count({
      where: { senderId: userId, status: 'RESPONDED', response: { downloadedByAdmin: false } },
    }),
    prisma.messageRecipient.count({
      where: { recipientId: userId, read: false, message: { priority: 'URGENT' } },
    }),
    prisma.transfer.count({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    }),
  ])

  const transfersCount = pendingIncoming + respondedOutgoing

  return NextResponse.json({
    transfersCount,
    messagesCount,
    hasUrgent: urgentCount > 0,
    totalTransfers,
  })
}
