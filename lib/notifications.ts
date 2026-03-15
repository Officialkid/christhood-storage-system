/**
 * lib/notifications.ts
 *
 * Central notification helper — creates in-app Notification records and
 * dispatches Web Push + email notifications based on user preferences.
 *
 * All functions are fire-and-forget safe: they never throw.
 */

import { prisma }                            from './prisma'
import { sendPushNotification, PushPayload } from './webpush'

const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'

// ─── Notification categories ────────────────────────────────────────────────
export type NotificationCategory =
  | 'UPLOAD_IN_FOLLOWED_FOLDER'
  | 'FILE_STATUS_CHANGED'
  | 'NEW_EVENT_CREATED'
  | 'FILE_RESTORED'
  | 'WEEKLY_DIGEST'
  | 'FILE_PUBLISHED_ALERT'
  | 'STORAGE_THRESHOLD_ALERT'
  | 'TRANSFER_RECEIVED'
  | 'TRANSFER_RESPONDED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'DIRECT_MESSAGE'

// ─────────────────────────────────────────────────────────────────────────────
// createInAppNotification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist an in-app notification for one user.
 * type  — maps to the Notification.type column (e.g. FILE_UPLOADED, TRANSFER_SENT)
 * title — short heading shown bold in the bell panel
 */
export async function createInAppNotification(
  userId:  string,
  message: string,
  link?:   string,
  type?:   string,
  title?:  string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        message,
        link,
        ...(type  ? { type }  : {}),
        ...(title ? { title } : {}),
      },
    })
  } catch (err) {
    console.error('[notifications] Failed to create in-app notification:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendPushToUser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a push notification to all active subscriptions of a single user
 * — if the user has opted in for the given category.
 * Expired / gone subscriptions are removed from the DB automatically.
 */
export async function sendPushToUser(
  userId:   string,
  category: NotificationCategory,
  payload:  PushPayload,
): Promise<void> {
  try {
    // Check user preference for this category (default: push = true)
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    })
    if (pref && !pref.push) return   // User opted out

    const subs = await prisma.pushSubscription.findMany({ where: { userId } })
    await Promise.all(
      subs.map(async (s) => {
        const ok = await sendPushNotification(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload,
        )
        if (!ok) {
          // Subscription expired — prune it
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        }
      }),
    )
  } catch (err) {
    console.error('[notifications] sendPushToUser failed:', err)
  }
}

/**
 * Dispatch in-app + push to multiple users at once.
 * type/title are threaded through to createInAppNotification.
 */
export async function notifyManyUsers(
  userIds:  string[],
  category: NotificationCategory,
  message:  string,
  payload:  PushPayload,
  link?:    string,
  type?:    string,
  title?:   string,
): Promise<void> {
  if (userIds.length === 0) return
  await Promise.all(
    userIds.map(async (uid) => {
      await createInAppNotification(uid, message, link, type, title)
      await sendPushToUser(uid, category, payload)
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a new file is uploaded to an event folder.
 *
 * Notifies:
 *   1. All active ADMIN + EDITOR users (they need to know about every upload).
 *   2. Any other user who follows that event folder.
 *
 * Also sends an upload alert email to admins/editors whose email preference
 * for UPLOAD_IN_FOLLOWED_FOLDER is enabled (default: enabled).
 *
 * The uploader themselves is never notified.
 */
export async function notifyUploadInFollowedFolder(opts: {
  eventId:      string
  eventName:    string
  fileName:     string
  uploaderId:   string
  fileId:       string
}): Promise<void> {
  try {
    // ── 1. All active admins + editors (excluding the uploader) ──────────────
    const staff = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: opts.uploaderId } },
          { isActive: true },
          { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
        ],
      },
      select: { id: true, email: true, username: true, name: true },
    })

    // ── 2. Folder followers who are NOT already in the staff list ────────────
    const staffIds = new Set(staff.map(u => u.id))
    const follows  = await prisma.folderFollow.findMany({
      where: { eventId: opts.eventId, NOT: { userId: opts.uploaderId } },
      select: { userId: true },
    })
    const followerOnlyIds = follows
      .map(f => f.userId)
      .filter(id => !staffIds.has(id))

    const allRecipientIds = [...staffIds, ...followerOnlyIds]
    if (allRecipientIds.length === 0) return

    const message  = `New file uploaded to "${opts.eventName}": ${opts.fileName}`
    const link     = `${APP_URL}/media/${opts.fileId}`
    const notifTitle = 'New Upload'

    // In-app + push for ALL recipients
    await notifyManyUsers(
      allRecipientIds,
      'UPLOAD_IN_FOLLOWED_FOLDER',
      message,
      { title: notifTitle, body: message, url: link, tag: `upload-${opts.eventId}` },
      link,
      'FILE_UPLOADED',
      notifTitle,
    )

    // ── 3. Email only to staff who have email enabled for this category ───────
    // Defer email import to avoid circular dependency at module init
    const { sendFileUploadedEmail } = await import('./email')

    // Fetch uploader name for the email
    const uploader = await prisma.user.findUnique({
      where:  { id: opts.uploaderId },
      select: { username: true, name: true, email: true },
    })
    const uploaderName = uploader?.username ?? uploader?.name ?? uploader?.email ?? 'Someone'

    const emailRecipients: string[] = []
    for (const u of staff) {
      const pref = await prisma.notificationPreference.findUnique({
        where: { userId_category: { userId: u.id, category: 'UPLOAD_IN_FOLLOWED_FOLDER' } },
      })
      // Default is to send email; only skip if explicitly opted out
      if (!pref || pref.email) emailRecipients.push(u.email)
    }

    if (emailRecipients.length > 0) {
      await sendFileUploadedEmail(emailRecipients, {
        fileName:     opts.fileName,
        fileId:       opts.fileId,
        eventName:    opts.eventName,
        uploaderName,
      })
    }
  } catch (err) {
    console.error('[notifications] notifyUploadInFollowedFolder failed:', err)
  }
}

/**
 * Called when a file's status changes.
 *
 * Notifies:
 *   1. All admins + editors (excluding the actor) — in-app + push.
 *   2. The original uploader (if they are not the actor) — in-app + push + email.
 *
 * uploaderId must be passed from the call site so we don't need to re-query the file.
 */
export async function notifyFileStatusChanged(opts: {
  fileId:     string
  fileName:   string
  newStatus:  string
  actorId:    string
  uploaderId: string
}): Promise<void> {
  try {
    const message = `"${opts.fileName}" status changed to ${opts.newStatus}`
    const link    = `${APP_URL}/media/${opts.fileId}`

    // ── 1. Notify all admins + editors (excluding the actor) ─────────────────
    const staff = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: opts.actorId } },
          { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
        ],
      },
      select: { id: true },
    })
    const staffIds = staff.map(u => u.id)

    await notifyManyUsers(
      staffIds,
      'FILE_STATUS_CHANGED',
      message,
      { title: 'File Status Updated', body: message, url: link, tag: `status-${opts.fileId}` },
      link,
      'FILE_STATUS_CHANGED',
      'File Status Updated',
    )

    // ── 2. Notify the uploader if they are not the actor ─────────────────────
    if (opts.uploaderId && opts.uploaderId !== opts.actorId) {
      const uploaderMessage = `Your file "${opts.fileName}" was updated to ${opts.newStatus}`
      await createInAppNotification(
        opts.uploaderId,
        uploaderMessage,
        link,
        'FILE_STATUS_CHANGED',
        'Your File Was Updated',
      )
      await sendPushToUser(opts.uploaderId, 'FILE_STATUS_CHANGED', {
        title: 'Your File Was Updated',
        body:  uploaderMessage,
        url:   link,
        tag:   `status-${opts.fileId}`,
      })

      // Email the uploader about their file's status change
      const uploader = await prisma.user.findUnique({
        where:  { id: opts.uploaderId },
        select: { email: true, username: true, name: true },
      })
      if (uploader) {
        // Check uploader's email preference for FILE_STATUS_CHANGED
        const pref = await prisma.notificationPreference.findUnique({
          where: { userId_category: { userId: opts.uploaderId, category: 'FILE_STATUS_CHANGED' } },
        })
        if (!pref || pref.email) {
          // Fetch actor name for the email
          const actor = await prisma.user.findUnique({
            where:  { id: opts.actorId },
            select: { username: true, name: true },
          })
          const changedBy = actor?.username ?? actor?.name ?? 'A team member'

          const { sendFileStatusChangedEmail } = await import('./email')
          await sendFileStatusChangedEmail({
            toEmail:   uploader.email,
            toName:    uploader.username ?? uploader.name ?? uploader.email,
            fileName:  opts.fileName,
            fileId:    opts.fileId,
            newStatus: opts.newStatus,
            changedBy,
          })
        }
      }
    }
  } catch (err) {
    console.error('[notifications] notifyFileStatusChanged failed:', err)
  }
}

/**
 * Called when a new Event is created.
 * Notifies all users.
 */
export async function notifyNewEventCreated(opts: {
  eventId:   string
  eventName: string
  actorId:   string
}): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where:  { id: { not: opts.actorId } },
      select: { id: true },
    })
    const ids     = users.map((u) => u.id)
    const message = `New event folder created: "${opts.eventName}"`
    const link    = `${APP_URL}/media?eventId=${opts.eventId}`

    await notifyManyUsers(
      ids,
      'NEW_EVENT_CREATED',
      message,
      { title: 'New Event', body: message, url: link, tag: `event-${opts.eventId}` },
      link,
      'NEW_EVENT_CREATED',
      'New Event',
    )
  } catch (err) {
    console.error('[notifications] notifyNewEventCreated failed:', err)
  }
}

/**
 * Called when a file is restored from the Trash.
 * Notifies all admins + editors, plus the original uploader.
 */
export async function notifyFileRestored(opts: {
  fileId:      string
  fileName:    string
  actorId:     string
  uploaderId?: string
}): Promise<void> {
  try {
    const recipientWhere: Record<string, unknown>[] = [
      { id: { not: opts.actorId } },
      { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
    ]
    const admins = await prisma.user.findMany({
      where:  { AND: recipientWhere },
      select: { id: true },
    })
    const ids     = admins.map((u) => u.id)
    const message = `"${opts.fileName}" has been restored from the Trash`
    const link    = `${APP_URL}/media/${opts.fileId}`

    await notifyManyUsers(
      ids,
      'FILE_RESTORED',
      message,
      { title: 'File Restored', body: message, url: link, tag: `restore-${opts.fileId}` },
      link,
      'FILE_RESTORED',
      'File Restored',
    )

    // Also notify the original uploader if they aren't the actor and not already in staff list
    if (opts.uploaderId && opts.uploaderId !== opts.actorId && !ids.includes(opts.uploaderId)) {
      await createInAppNotification(
        opts.uploaderId,
        `Your file "${opts.fileName}" has been restored from the Trash`,
        link,
        'FILE_RESTORED',
        'File Restored',
      )
    }
  } catch (err) {
    console.error('[notifications] notifyFileRestored failed:', err)
  }
}

/**
 * Called when a file is marked PUBLISHED.
 * Notifies all editors and admins via in-app + push.
 * Email is handled separately in the status route.
 */
export async function notifyFilePublished(opts: {
  fileId:   string
  fileName: string
  actorId:  string
}): Promise<void> {
  try {
    const editors = await prisma.user.findMany({
      where:  {
        AND: [
          { id: { not: opts.actorId } },
          { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
        ],
      },
      select: { id: true },
    })
    const ids     = editors.map((u) => u.id)
    const message = `"${opts.fileName}" has been published`
    const link    = `${APP_URL}/media/${opts.fileId}`

    await notifyManyUsers(
      ids,
      'FILE_PUBLISHED_ALERT',
      message,
      { title: 'File Published', body: message, url: link, tag: `published-${opts.fileId}` },
      link,
      'FILE_PUBLISHED_ALERT',
      'File Published',
    )
  } catch (err) {
    console.error('[notifications] notifyFilePublished failed:', err)
  }
}

/**
 * Called when an admin sends a direct or broadcast message.
 * Creates in-app notifications + push for all recipients.
 * (Email is handled separately by messageDelivery.ts)
 */
export async function notifyDirectMessage(opts: {
  messageId:    string
  senderName:   string
  subject:      string
  priority:     'NORMAL' | 'URGENT'
  recipientIds: string[]
}): Promise<void> {
  try {
    const link    = `${APP_URL}/messages/${opts.messageId}`
    const preview = opts.subject.length > 80 ? opts.subject.slice(0, 80) + '…' : opts.subject
    const msgText = `${opts.senderName}: ${preview}`
    const title   = opts.priority === 'URGENT' ? '🔴 Urgent Message' : '📬 New Message'

    await notifyManyUsers(
      opts.recipientIds,
      'DIRECT_MESSAGE',
      msgText,
      { title, body: msgText, url: link, tag: `message-${opts.messageId}` },
      link,
      'DIRECT_MESSAGE',
      title,
    )
  } catch (err) {
    console.error('[notifications] notifyDirectMessage failed:', err)
  }
}
