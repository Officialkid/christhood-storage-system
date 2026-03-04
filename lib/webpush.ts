/**
 * lib/webpush.ts
 * Thin wrapper around the `web-push` library, configured with VAPID credentials.
 * Usage: import { sendPushNotification } from '@/lib/webpush'
 */

import webpush from 'web-push'

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? 'mailto:admin@christhood.org'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export interface PushPayload {
  title:   string
  body:    string
  icon?:   string
  badge?:  string
  url?:    string
  tag?:    string
}

export interface StoredSubscription {
  endpoint: string
  p256dh:   string
  auth:     string
}

/**
 * Send a push notification to a single stored subscription.
 * Returns true on success, false if the subscription is gone (expired / unsubscribed).
 * Never throws — all errors are swallowed and logged.
 */
export async function sendPushNotification(
  sub:     StoredSubscription,
  payload: PushPayload,
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[webpush] VAPID keys not configured — skipping push.')
    return false
  }

  const pushSub: webpush.PushSubscription = {
    endpoint: sub.endpoint,
    keys:     { p256dh: sub.p256dh, auth: sub.auth },
  }

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload))
    return true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      // Subscription is gone — caller should remove it from DB
      return false
    }
    console.error('[webpush] Failed to send push notification:', err)
    return false
  }
}

export { webpush }
