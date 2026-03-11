/**
 * lib/messageDelivery.ts
 *
 * Message delivery service — resolves per-recipient notification preferences
 * and dispatches push notifications and emails.
 *
 * The notification panel queries the MessageRecipient table directly, so this
 * module does NOT create Notification records for messages.
 *
 * Delivery rules:
 *   NORMAL  — push / email only if recipient has those prefs enabled (default: true)
 *   URGENT  — push + email delivered regardless of preferences
 */

import { prisma }                            from './prisma'
import { sendPushNotification, PushPayload } from './webpush'
import { sendMessageEmail }                  from './email'

const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'

export async function deliverMessage(messageId: string): Promise<void> {
  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { name: true, username: true } },
        recipients: {
          include: {
            recipient: {
              select: { id: true, email: true, name: true, username: true },
            },
          },
        },
        attachmentTransfer: {
          select: { id: true, subject: true, totalFiles: true },
        },
      },
    })

    if (!message) {
      console.error('[messageDelivery] Message not found:', messageId)
      return
    }

    const senderName = message.sender.name ?? message.sender.username ?? 'Admin'
    const isUrgent   = message.priority === 'URGENT'
    const msgLink    = `${APP_URL}/messages/inbox/${messageId}`

    const pushPayload: PushPayload = {
      title: isUrgent ? '🔴 Urgent Message' : '📬 New Message',
      body:  `${senderName}: ${message.subject}`,
      url:   msgLink,
      tag:   `message-${messageId}`,
    }

    await Promise.all(
      message.recipients.map(async (mr) => {
        const userId = mr.recipientId
        const user   = mr.recipient

        // Fetch per-user DIRECT_MESSAGE preference (null = both push + email default true)
        const pref = await prisma.notificationPreference.findUnique({
          where: { userId_category: { userId, category: 'DIRECT_MESSAGE' } },
        })

        // ── Push ─────────────────────────────────────────────────────────
        // URGENT: always; NORMAL: respect push preference (default true)
        const shouldPush = isUrgent || !pref || pref.push
        if (shouldPush) {
          const subs = await prisma.pushSubscription.findMany({ where: { userId } })
          await Promise.all(
            subs.map(async (s) => {
              const ok = await sendPushNotification(
                { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
                pushPayload,
              )
              if (!ok) {
                // Expired subscription — prune it
                await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
              }
            }),
          )
        }

        // ── Email ────────────────────────────────────────────────────────
        // URGENT: always; NORMAL: respect email preference (default true)
        const shouldEmail = isUrgent || !pref || pref.email
        if (shouldEmail) {
          await sendMessageEmail({
            toEmail:    user.email,
            toName:     user.name ?? user.username ?? user.email,
            senderName,
            subject:    message.subject,
            body:       message.body,
            priority:   isUrgent ? 'URGENT' : 'NORMAL',
            messageId,
            attachmentTransfer: message.attachmentTransfer
              ? {
                  id:        message.attachmentTransfer.id,
                  subject:   message.attachmentTransfer.subject,
                  fileCount: message.attachmentTransfer.totalFiles,
                }
              : null,
          })
        }
      }),
    )
  } catch (err) {
    console.error('[messageDelivery] deliverMessage failed:', err)
  }
}
