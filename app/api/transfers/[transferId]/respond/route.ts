import { NextRequest, NextResponse }      from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }               from 'next-auth'
import { authOptions }                    from '@/lib/auth'
import { prisma }                         from '@/lib/prisma'
import { deleteObject }                   from '@/lib/r2'
import { log }                            from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { sendTransferRespondedEmail }     from '@/lib/email'
import { logger }                         from '@/lib/logger'

interface ResponseFilePayload {
  originalName: string
  r2Key:        string
  fileSize:     number
  mimeType:     string
  folderPath:   string | null
  checksum:     string
}

/**
 * POST /api/transfers/[transferId]/respond
 *
 * Called by the recipient after uploading all edited files to R2 via presigned URLs.
 * Creates a TransferResponse + TransferResponseFile records, marks the transfer RESPONDED,
 * and notifies the admin who sent the original transfer.
 *
 * Rules:
 *   - Only the designated recipient may call this.
 *   - Transfer must be in DOWNLOADED state (PENDING blocks upload; RESPONDED/COMPLETED/EXPIRED blocks re-submit).
 *   - On DB failure, all uploaded R2 objects are deleted to prevent orphans.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      sender:    { select: { id: true, username: true, name: true, email: true } },
      recipient: { select: { id: true, username: true, name: true } },
    },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  if (transfer.recipientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (transfer.status === 'PENDING') {
    return NextResponse.json({ error: 'Download the transfer files before responding' }, { status: 400 })
  }

  if (transfer.status === 'RESPONDED') {
    return NextResponse.json({ error: 'A response has already been submitted for this transfer' }, { status: 409 })
  }

  if (transfer.status === 'EXPIRED') {
    return NextResponse.json({ error: 'This transfer has expired' }, { status: 400 })
  }

  if (transfer.status === 'COMPLETED') {
    return NextResponse.json({ error: 'This transfer is already completed' }, { status: 400 })
  }

  const body = await req.json()
  const { files, message } = body as {
    files:   ResponseFilePayload[]
    message: string | null
  }

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 })
  }

  const totalBytes = files.reduce((s, f) => s + f.fileSize, 0)
  const r2Prefix   = `transfers/${transferId}/response/`

  logger.info('TRANSFER_RESPOND_STARTED', { userId: session.user.id, userRole: session.user.role as string, route: '/api/transfers/respond', transferId, message: `Recipient is submitting ${files.length} file(s) for transfer ${transferId}`, metadata: { fileCount: files.length } })

  // ── Atomic DB write ────────────────────────────────────────────────────────
  let responseId: string
  try {
    const [response] = await prisma.$transaction([
      prisma.transferResponse.create({
        data: {
          transferId,
          uploadedById: session.user.id,
          message:      message?.trim() || null,
          r2Prefix,
          totalFiles:   files.length,
          totalSize:    BigInt(totalBytes),
          files: {
            create: files.map(f => ({
              originalName: f.originalName,
              r2Key:        f.r2Key,
              fileSize:     BigInt(f.fileSize),
              mimeType:     f.mimeType,
              folderPath:   f.folderPath,
              checksum:     f.checksum,
            })),
          },
        },
      }),
      prisma.transfer.update({
        where: { id: transferId },
        data:  { status: 'RESPONDED' },
      }),
    ])
    responseId = response.id
  } catch (err) {
    logger.error('TRANSFER_RESPOND_FAILED', { userId: session.user.id, route: '/api/transfers/respond', transferId, error: (err as Error)?.message, errorCode: (err as any)?.code, message: 'DB write failed — rolling back R2 uploads' })
    // Delete all uploaded objects so they don't orphan in R2
    await Promise.allSettled(files.map(f => deleteObject(f.r2Key)))
    return handleApiError(err, 'transfers/respond')
  }

  // ── Side-effects (fire-and-forget) ────────────────────────────────────────

  const recipientName = transfer.recipient.username ?? transfer.recipient.name ?? session.user.email ?? 'Recipient'
  const senderEmail   = transfer.sender.email
  const senderName    = transfer.sender.username ?? transfer.sender.name ?? 'Admin'
  const notifMsg      = `${recipientName} sent back ${files.length} edited file${files.length !== 1 ? 's' : ''} for: "${transfer.subject}"`
  const notifLink     = `/transfers/sent/${transferId}`

  log('TRANSFER_RESPONDED', session.user.id, {
    metadata: { transferId, subject: transfer.subject, fileCount: files.length },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/respond', transferId, error: (e as Error)?.message, message: '[respond] log failed' }))

  createInAppNotification(transfer.senderId, notifMsg, notifLink)
    .catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/respond', transferId, error: (e as Error)?.message, message: '[respond] in-app notif failed' }))

  sendPushToUser(transfer.senderId, 'TRANSFER_RESPONDED', {
    title:   '✅ Transfer Response Received',
    body:    notifMsg,
    url:     notifLink,
    tag:     `transfer-responded-${transferId}`,
    type:    'TRANSFER_RESPONDED',
    payload: { transferId, recipientName, subject: transfer.subject, fileCount: files.length },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/respond', transferId, error: (e as Error)?.message, message: '[respond] push failed' }))

  if (senderEmail) {
    // Respect TRANSFER_RESPONDED email preference (default: send)
    prisma.notificationPreference.findUnique({
      where: { userId_category: { userId: transfer.senderId, category: 'TRANSFER_RESPONDED' } },
    }).then((pref) => {
      if (pref && !pref.email) return
      return sendTransferRespondedEmail({
        toEmail:       senderEmail,
        toName:        senderName,
        recipientName,
        subject:       transfer.subject,
        recipientMsg:  message?.trim() || null,
        fileCount:     files.length,
        totalSize:     totalBytes,
        transferId,
      })
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/respond', transferId, error: (e as Error)?.message, message: '[respond] email failed' }))
  }

  return NextResponse.json({ success: true, responseId, totalFiles: files.length })
}
