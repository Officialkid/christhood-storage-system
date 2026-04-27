import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'
import { log }                        from '@/lib/activityLog'
import { logger }                     from '@/lib/logger'

/**
 * GET /api/transfers/[transferId]/files/[fileId]
 *
 * Returns a short-lived presigned R2 download URL for a single file.
 * Recipient, sender, or ADMIN may access.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string; fileId: string }> }
) {
  const { transferId, fileId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify transfer ownership / admin access
  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { recipientId: true, senderId: true, status: true, subject: true },
  })
  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  const canAccess =
    transfer.recipientId === session.user.id ||
    transfer.senderId === session.user.id ||
    session.user.role === 'ADMIN'

  if (!canAccess) {
    return NextResponse.json(
      { error: 'This transfer is private. Only the sender/recipient may access its files.' },
      { status: 403 },
    )
  }

  const file = await prisma.transferFile.findFirst({
    where:  { id: fileId, transferId },
    select: { r2Key: true, originalName: true },
  })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // If recipient is downloading for the first time via single-file access,
  // transition status and write a single TRANSFER_DOWNLOADED activity event.
  const isRecipient = transfer.recipientId === session.user.id
  if (isRecipient && transfer.status === 'PENDING') {
    const updated = await prisma.transfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data:  { status: 'DOWNLOADED' },
    })

    if (updated.count > 0) {
      log('TRANSFER_DOWNLOADED', session.user.id, {
        metadata: {
          transferId,
          subject:     transfer.subject,
          senderId:    transfer.senderId,
          recipientId: transfer.recipientId,
        },
      }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/[transferId]/files/[fileId]', transferId, error: (e as Error)?.message, message: 'Activity log failed' }))
    }
  }

  const url = await getPresignedDownloadUrl(file.r2Key, 3600)
  return NextResponse.json({ url, filename: file.originalName })
}
