import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

function formatSize(bytes: bigint): string {
  const n = Number(bytes)
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/**
 * GET /api/messages/inbox
 * Returns the current user's message inbox, sorted:
 *   1. URGENT + unread first
 *   2. NORMAL + unread
 *   3. Read messages (newest first)
 *
 * All authenticated roles can access their inbox.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const rows = await prisma.messageRecipient.findMany({
    where:   { recipientId: userId },
    include: {
      message: {
        include: {
          sender: { select: { id: true, name: true, username: true } },
          attachmentTransfer: {
            select: {
              id:         true,
              subject:    true,
              totalFiles: true,
              totalSize:  true,
              status:     true,
            },
          },
        },
      },
    },
  })

  // Sort: URGENT+unread → NORMAL+unread → URGENT+read → NORMAL+read; newest-first within groups
  const rank = (r: typeof rows[0]) => {
    if (!r.read && r.message.priority === 'URGENT') return 0
    if (!r.read)                                     return 1
    if (r.read  && r.message.priority === 'URGENT')  return 2
    return 3
  }

  rows.sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return b.message.createdAt.getTime() - a.message.createdAt.getTime()
  })

  const messages = rows.map((r) => ({
    id:        r.message.id,
    subject:   r.message.subject,
    body:      r.message.body,
    priority:  r.message.priority as 'NORMAL' | 'URGENT',
    read:      r.read,
    readAt:    r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    sender: {
      id:       r.message.sender.id,
      name:     r.message.sender.name,
      username: r.message.sender.username,
    },
    attachmentTransfer: r.message.attachmentTransfer
      ? {
          id:         r.message.attachmentTransfer.id,
          subject:    r.message.attachmentTransfer.subject,
          totalFiles: r.message.attachmentTransfer.totalFiles,
          totalSize:  formatSize(r.message.attachmentTransfer.totalSize),
          status:     r.message.attachmentTransfer.status as string,
        }
      : null,
  }))

  const unreadCount = rows.filter((r) => !r.read).length

  return NextResponse.json({ messages, unreadCount })
}
