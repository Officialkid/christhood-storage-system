import { NextRequest, NextResponse }             from 'next/server'
import { getServerSession }                       from 'next-auth'
import { authOptions }                            from '@/lib/auth'
import { prisma }                                 from '@/lib/prisma'
import { deleteObject }                           from '@/lib/r2'
import { log }                                    from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { logger }                                 from '@/lib/logger'

/**
 * POST /api/admin/transfers/[id]/cancel
 *
 * Admin-only system-level cancel for any PENDING transfer.
 * - Transfer must be in PENDING state.
 * - Updates Transfer.status → EXPIRED.
 * - Deletes all R2 objects for the transfer's files (best-effort).
 * - Notifies the recipient in-app and via push.
 * - Logs TRANSFER_CANCELLED.
 *
 * Transfers are private — Admins may not view file content, but retain the
 * operational ability to cancel transfers for moderation or compliance purposes.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — admin only.' }, { status: 403 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      files:     { select: { r2Key: true } },
      sender:    { select: { username: true, name: true } },
      recipient: { select: { id: true, username: true, name: true, email: true } },
    },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }
  if (transfer.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Only PENDING transfers can be cancelled. Current status: "${transfer.status}".` },
      { status: 400 },
    )
  }

  // ── Update DB first so no further downloads can occur ─────────────────────
  await prisma.transfer.update({
    where: { id: transferId },
    data:  { status: 'EXPIRED' },
  })

  // ── Delete R2 objects (best-effort) ───────────────────────────────────────
  const results = await Promise.allSettled(
    transfer.files.map(f => deleteObject(f.r2Key)),
  )
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    logger.warn('TRANSFER_R2_CLEANUP_PARTIAL', {
      route:      '/api/admin/transfers/cancel',
      transferId,
      message:    `${failed}/${transfer.files.length} R2 objects could not be deleted for transferId=${transferId}`,
    })
  }

  // ── Side-effects (fire-and-forget) ────────────────────────────────────────
  const senderName = transfer.sender.username ?? transfer.sender.name ?? 'Admin'
  const notifMsg   = `A transfer from ${senderName} has been cancelled by an administrator: "${transfer.subject}"`
  const notifLink  = `/transfers/inbox`

  log('TRANSFER_CANCELLED', session.user.id, {
    metadata: {
      transferId,
      subject:   transfer.subject,
      fileCount: transfer.files.length,
      cancelledByAdmin: true,
    },
  }).catch((e: unknown) =>
    logger.warn('TRANSFER_SIDE_EFFECT_FAILED', {
      route: '/api/admin/transfers/cancel', transferId,
      error: (e as Error)?.message, message: '[admin-cancel] log failed',
    }),
  )

  createInAppNotification(transfer.recipientId, notifMsg, notifLink)
    .catch((e: unknown) =>
      logger.warn('TRANSFER_SIDE_EFFECT_FAILED', {
        route: '/api/admin/transfers/cancel', transferId,
        error: (e as Error)?.message, message: '[admin-cancel] in-app notif failed',
      }),
    )

  sendPushToUser(transfer.recipientId, 'TRANSFER_CANCELLED', {
    title:   '❌ Transfer Cancelled',
    body:    notifMsg,
    url:     notifLink,
    tag:     `transfer-cancelled-${transferId}`,
    type:    'TRANSFER_CANCELLED',
    payload: { transferId, senderName, subject: transfer.subject },
  }).catch((e: unknown) =>
    logger.warn('TRANSFER_SIDE_EFFECT_FAILED', {
      route: '/api/admin/transfers/cancel', transferId,
      error: (e as Error)?.message, message: '[admin-cancel] push failed',
    }),
  )

  logger.info('TRANSFER_CANCELLED', {
    userId:   session.user.id,
    userRole: session.user.role as string,
    route:    '/api/admin/transfers/cancel',
    transferId,
    message:  `Transfer ${transferId} force-cancelled by admin ${session.user.id}: ${transfer.files.length - failed}/${transfer.files.length} R2 objects deleted`,
  })

  return NextResponse.json({ success: true, transferId })
}
