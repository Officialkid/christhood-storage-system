import { NextRequest, NextResponse }            from 'next/server'
import { getServerSession }                      from 'next-auth'
import { authOptions }                           from '@/lib/auth'
import { prisma }                                from '@/lib/prisma'
import { log }                                   from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { sendTransferCompletedEmail }            from '@/lib/email'
import { logger }                                from '@/lib/logger'

/**
 * PATCH /api/transfers/[transferId]/complete
 *
 * Admin marks a responded transfer as COMPLETED.
 * - Transfer must be in RESPONDED state.
 * - Updates Transfer.status → COMPLETED and expiresAt → now + 30 days.
 * - Sets TransferResponse.downloadedByAdmin → true.
 * - Notifies the recipient in-app and via push.
 * - Logs TRANSFER_COMPLETED.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      recipient: { select: { id: true, username: true, name: true, email: true } },
      response:  { select: { id: true } },
    },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }
  if (transfer.status !== 'RESPONDED') {
    return NextResponse.json(
      { error: `Cannot complete a transfer in status "${transfer.status}". Must be RESPONDED.` },
      { status: 400 },
    )
  }
  if (!transfer.response) {
    return NextResponse.json({ error: 'No response found for this transfer' }, { status: 400 })
  }

  const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  // Atomic update: status, expiresAt, downloadedByAdmin
  await prisma.$transaction([
    prisma.transfer.update({
      where: { id: transferId },
      data:  { status: 'COMPLETED', expiresAt: newExpiresAt },
    }),
    prisma.transferResponse.update({
      where: { id: transfer.response.id },
      data:  { downloadedByAdmin: true },
    }),
  ])

  // ── Side-effects (fire-and-forget) ─────────────────────────────────────────

  const recipientName = transfer.recipient.username ?? transfer.recipient.name ?? transfer.recipient.email ?? 'User'
  const notifMsg      = `Your transfer "${transfer.subject}" has been completed. Thank you!`
  const notifLink     = `/transfers/inbox/${transferId}`

  log('TRANSFER_COMPLETED', session.user.id, {
    metadata: { transferId, subject: transfer.subject },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/complete', transferId, error: (e as Error)?.message, message: '[complete] log failed' }))

  createInAppNotification(transfer.recipientId, notifMsg, notifLink)
    .catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/complete', transferId, error: (e as Error)?.message, message: '[complete] in-app notif failed' }))

  sendPushToUser(transfer.recipientId, 'TRANSFER_COMPLETED', {
    title:   '🎉 Transfer Completed',
    body:    notifMsg,
    url:     notifLink,
    tag:     `transfer-completed-${transferId}`,
    type:    'TRANSFER_COMPLETED',
    payload: { transferId, subject: transfer.subject },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/complete', transferId, error: (e as Error)?.message, message: '[complete] push failed' }))

  // Email the recipient if they have a TRANSFER_COMPLETED email preference (default: send)
  if (transfer.recipient.email) {
    prisma.notificationPreference.findUnique({
      where: { userId_category: { userId: transfer.recipientId, category: 'TRANSFER_COMPLETED' } },
    }).then((pref) => {
      if (pref?.email === false) return
      const adminName = session.user.username ?? session.user.name ?? session.user.email ?? 'Admin'
      return sendTransferCompletedEmail({
        toEmail:    transfer.recipient.email as string,
        toName:     recipientName,
        adminName,
        subject:    transfer.subject,
        transferId,
      })
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/complete', transferId, error: (e as Error)?.message, message: '[complete] email failed' }))
  }

  logger.info('TRANSFER_COMPLETED', { userId: session.user.id, userRole: session.user.role as string, route: '/api/transfers/complete', transferId, message: `Transfer ${transferId} completed by ${session.user.id} for recipient ${recipientName}` })

  return NextResponse.json({ success: true })
}
