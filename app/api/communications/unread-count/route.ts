import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/communications/unread-count
 *
 * Returns the current user's actionable unread/pending counts across the
 * Communications Hub — used by the polling hook, nav badge, and tab badges.
 *
 * Response shape:
 * {
 *   transfers: number,   // PENDING transfers where user is recipient (non-admin)
 *                        // or RESPONDED transfers awaiting admin review (admin)
 *   messages:  number,   // unread MessageRecipient records for the current user
 *   urgent:    boolean,  // true if any unread message has priority URGENT
 *   total:     number    // transfers + messages combined (convenient for badge)
 * }
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json(
      { transfers: 0, messages: 0, urgent: false, total: 0 },
    )
  }

  const userId  = session.user.id
  const isAdmin = session.user.role === 'ADMIN'

  const [messages, transfers, urgentCount] = await Promise.all([
    prisma.messageRecipient.count({
      where: { recipientId: userId, read: false },
    }),
    isAdmin
      ? prisma.transfer.count({ where: { senderId: userId, status: 'RESPONDED' } })
      : prisma.transfer.count({ where: { recipientId: userId, status: 'PENDING' } }),
    prisma.messageRecipient.count({
      where: { recipientId: userId, read: false, message: { priority: 'URGENT' } },
    }),
  ])

  return NextResponse.json({
    transfers,
    messages,
    urgent: urgentCount > 0,
    total:  transfers + messages,
  })
}
