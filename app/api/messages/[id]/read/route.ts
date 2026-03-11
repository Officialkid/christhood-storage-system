import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * PATCH /api/messages/[id]/read
 * Marks the MessageRecipient record for the current user + this message as read.
 * [id] = Message.id  (not MessageRecipient.id)
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recipient = await prisma.messageRecipient.findUnique({
    where: {
      messageId_recipientId: {
        messageId:   params.id,
        recipientId: session.user.id,
      },
    },
  })

  if (!recipient) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!recipient.read) {
    await prisma.messageRecipient.update({
      where: {
        messageId_recipientId: {
          messageId:   params.id,
          recipientId: session.user.id,
        },
      },
      data: { read: true, readAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
