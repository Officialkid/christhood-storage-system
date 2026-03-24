import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/messages/sent
 * All authenticated users. Returns all messages sent by the current user, with
 * read-receipt summary counts (readCount, totalCount) per message.
 * Sorted newest-first.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const messages = await prisma.message.findMany({
    where:   { senderId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      attachmentTransfer: {
        select: { id: true, subject: true, totalFiles: true },
      },
      recipients: {
        select: { read: true },
      },
    },
  })

  const result = messages.map((m) => {
    const totalCount = m.recipients.length
    const readCount  = m.recipients.filter((r) => r.read).length

    return {
      id:            m.id,
      subject:       m.subject,
      priority:      m.priority as 'NORMAL' | 'URGENT',
      broadcastRole: m.broadcastRole,
      createdAt:     m.createdAt.toISOString(),
      readCount,
      totalCount,
      hasAttachment: !!m.attachmentTransferId,
    }
  })

  return NextResponse.json({ messages: result })
}
