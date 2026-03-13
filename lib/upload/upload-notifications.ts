/**
 * lib/upload/upload-notifications.ts
 *
 * Upload progress notifications for installed PWA users.
 *
 * Architecture:
 *   – All notification work is delegated to the service worker via postMessage.
 *     The SW calls `registration.showNotification()` so the notification
 *     persists even when the PWA is backgrounded or the screen is locked.
 *   – The same `tag` is reused for every update so only ONE notification
 *     exists at a time (each update replaces the previous one).
 *   – For browser (non-PWA) users: helpers are no-ops. The component shows
 *     an in-app progress bar instead.
 *
 * Requires the SW message handler in public/sw.js to handle:
 *   UPLOAD_PROGRESS | UPLOAD_COMPLETE | UPLOAD_FAILED | UPLOAD_DISMISS
 */

const NOTIF_TAG = 'cmms-upload-progress'

/** Post a message to the active service worker. Fire-and-forget. */
function postToSW(msg: Record<string, unknown>): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  navigator.serviceWorker.ready
    .then(reg => reg.active?.postMessage(msg))
    .catch(() => { /* SW not available — fail silently */ })
}

/**
 * Request notification permission from the user.
 * Call once when the first upload starts. Non-blocking — fire and forget.
 * Returns true if permission was already granted, false otherwise.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted')  return true
  if (Notification.permission === 'denied')   return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** Whether push notifications are currently permitted. */
export function notificationsGranted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * Update (or create) the upload-progress notification.
 *
 * @param active  Files currently uploading
 * @param total   Total files in this batch
 * @param pct     Overall progress 0–100
 * @param speed   Optional human-readable speed string, e.g. "2.3 MB/s"
 */
export function notifyUploadProgress(
  active: number,
  total:  number,
  pct:    number,
  speed?: string,
): void {
  if (!notificationsGranted()) return
  postToSW({ type: 'UPLOAD_PROGRESS', active, total, pct, speed, tag: NOTIF_TAG })
}

/**
 * Show a "Upload complete" notification.
 * Replaces the progress notification.
 */
export function notifyUploadComplete(total: number): void {
  if (!notificationsGranted()) return
  postToSW({ type: 'UPLOAD_COMPLETE', total, tag: NOTIF_TAG })
}

/**
 * Show an "Upload failed" notification.
 * Replaces the progress notification.
 */
export function notifyUploadFailed(failedCount: number): void {
  if (!notificationsGranted()) return
  postToSW({ type: 'UPLOAD_FAILED', failedCount, tag: NOTIF_TAG })
}

/** Dismiss the upload notification (e.g. when user navigates back to /upload). */
export function dismissUploadNotification(): void {
  postToSW({ type: 'UPLOAD_DISMISS', tag: NOTIF_TAG })
}
