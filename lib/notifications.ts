/**
 * lib/notifications.ts
 *
 * Central notification helper — creates in-app Notification records and
 * dispatches Web Push notifications based on user preferences.
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

// ─────────────────────────────────────────────────────────────────────────────
// createInAppNotification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist an in-app notification for one user.
 */
export async function createInAppNotification(
  userId:  string,
  message: string,
  link?:   string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, message, link },
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
 */
export async function notifyManyUsers(
  userIds:  string[],
  category: NotificationCategory,
  message:  string,
  payload:  PushPayload,
  link?:    string,
): Promise<void> {
  if (userIds.length === 0) return
  await Promise.all(
    userIds.map(async (uid) => {
      await createInAppNotification(uid, message, link)
      await sendPushToUser(uid, category, payload)
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a new file is uploaded to an event folder.
 * Notifies every user who follows that event (except the uploader themselves).
 */
export async function notifyUploadInFollowedFolder(opts: {
  eventId:      string
  eventName:    string
  fileName:     string
  uploaderId:   string
  fileId:       string
}): Promise<void> {
  try {
    const follows = await prisma.folderFollow.findMany({
      where:  { eventId: opts.eventId, NOT: { userId: opts.uploaderId } },
      select: { userId: true },
    })
    const ids = follows.map((f) => f.userId)
    if (ids.length === 0) return

    const message = `New file uploaded to "${opts.eventName}": ${opts.fileName}`
    const link    = `${APP_URL}/media/${opts.fileId}`

    await notifyManyUsers(ids, 'UPLOAD_IN_FOLLOWED_FOLDER', message, {
      title: 'New Upload',
      body:  message,
      url:   link,
      tag:   `upload-${opts.eventId}`,
    }, link)
  } catch (err) {
    console.error('[notifications] notifyUploadInFollowedFolder failed:', err)
  }
}

/**
 * Called when a file's status changes.
 * Notifies all admins + editors, plus the original uploader.
 */
export async function notifyFileStatusChanged(opts: {
  fileId:     string
  fileName:   string
  newStatus:  string
  actorId:    string
}): Promise<void> {
  try {
    const recipients = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: opts.actorId } },          // don't notify the person who changed it
          { OR: [
            { role: 'ADMIN' },
            { role: 'EDITOR' },
          ]},
        ],
      },
      select: { id: true },
    })
    const ids     = recipients.map((u) => u.id)
    const message = `"${opts.fileName}" status changed to ${opts.newStatus}`
    const link    = `${APP_URL}/media/${opts.fileId}`

    await notifyManyUsers(ids, 'FILE_STATUS_CHANGED', message, {
      title: 'File Status Updated',
      body:  message,
      url:   link,
      tag:   `status-${opts.fileId}`,
    }, link)
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

    await notifyManyUsers(ids, 'NEW_EVENT_CREATED', message, {
      title: 'New Event',
      body:  message,
      url:   link,
      tag:   `event-${opts.eventId}`,
    }, link)
  } catch (err) {
    console.error('[notifications] notifyNewEventCreated failed:', err)
  }
}

/**
 * Called when a file is restored from the Trash.
 * Notifies all admins + editors.
 */
export async function notifyFileRestored(opts: {
  fileId:   string
  fileName: string
  actorId:  string
}): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where:  {
        AND: [
          { id: { not: opts.actorId } },
          { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
        ],
      },
      select: { id: true },
    })
    const ids     = admins.map((u) => u.id)
    const message = `"${opts.fileName}" has been restored from the Trash`
    const link    = `${APP_URL}/media/${opts.fileId}`

    await notifyManyUsers(ids, 'FILE_RESTORED', message, {
      title: 'File Restored',
      body:  message,
      url:   link,
      tag:   `restore-${opts.fileId}`,
    }, link)
  } catch (err) {
    console.error('[notifications] notifyFileRestored failed:', err)
  }
}

/**
 * Called when a file is marked PUBLISHED.
 * Notifies all editors (and admins) via in-app + email.
 * Email is handled separately in the email lib; this only does in-app + push.
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

    await notifyManyUsers(ids, 'FILE_PUBLISHED_ALERT', message, {
      title: 'File Published',
      body:  message,
      url:   link,
      tag:   `published-${opts.fileId}`,
    }, link)
  } catch (err) {
    console.error('[notifications] notifyFilePublished failed:', err)
  }
}
