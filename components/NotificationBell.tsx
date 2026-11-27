'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link                                           from 'next/link'
import { Bell }                                       from 'lucide-react'
import { useToast }                                   from '@/lib/toast'

// Convert base64url → Uint8Array (required for PushManager.subscribe)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Plays a subtle two-tone chime. Falls back gracefully if autoplay is blocked. */
function playNotificationChime() {
  try {
    const audio = new Audio('/sounds/notification.wav')
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {
    // Audio API not available — silently ignore
  }
}

export function NotificationBell() {
  const toast = useToast()
  const [unreadCount, setUnreadCount] = useState(0)
  const [pushEnabled, setPushEnabled] = useState(false)
  // Track previous count so we can detect new arrivals and play a chime
  const prevCountRef = useRef<number | null>(null)

  // ── Poll unread count every 30 s ──────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    try {
      const res  = await fetch('/api/notifications/unread-count')
      const data = await res.json()
      setUnreadCount(data.count ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, 30_000)
    return () => clearInterval(id)
  }, [refreshCount])

  // ── Play chime when a new notification arrives ────────────────────────────
  useEffect(() => {
    if (prevCountRef.current !== null && unreadCount > prevCountRef.current) {
      playNotificationChime()
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  // ── Refresh badge from the notifications page or message inbox ───────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ unreadCount?: number }>).detail
      if (typeof detail?.unreadCount === 'number') {
        setUnreadCount(detail.unreadCount)
      } else {
        refreshCount()
      }
    }
    const invalidateHandler = () => refreshCount()
    window.addEventListener('messagemarkedread',       handler)
    window.addEventListener('notifications:invalidate', invalidateHandler)
    return () => {
      window.removeEventListener('messagemarkedread',       handler)
      window.removeEventListener('notifications:invalidate', invalidateHandler)
    }
  }, [refreshCount])

  // ── Register Service Worker + restore push state ─────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[push] SW registration failed:', err)
    })

    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      if (existing) setPushEnabled(true)
    }).catch(() => {})
  }, [])

  // ── Subscribe to push notifications ───────────────────────────────────────
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Push notifications are not supported in this browser.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notification permission was not granted.')
        return
      }

      const keyRes = await fetch('/api/push/vapid-key')
      if (!keyRes.ok) {
        toast.error('Push notifications are not configured on this server.')
        return
      }
      const { publicKey } = await keyRes.json()

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      })
      const subJson = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint: sub.endpoint,
          keys:     { p256dh: subJson.keys?.p256dh ?? '', auth: subJson.keys?.auth ?? '' },
        }),
      })
      setPushEnabled(true)
      toast.success('Push notifications enabled.')
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
      toast.error('Could not enable push notifications. Please try again.')
    }
  }

  // ── Unsubscribe ────────────────────────────────────────────────────────────
  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
      toast.success('Push notifications disabled.')
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
      toast.error('Could not disable push notifications. Please try again.')
    }
  }

  return (
    <div data-tour="notification-bell" className="relative flex items-center">
      {/* Bell — navigates to /notifications inbox */}
      <Link
        href="/notifications"
        aria-label="Notifications"
        className="relative flex items-center justify-center h-[38px] w-[38px] rounded-xl border border-slate-800 bg-slate-900/80 transition-colors text-slate-300
                   hover:bg-slate-800 hover:text-white"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center
                           rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {/* Subtle push-status indicator dot inside bottom-right of bell button */}
        <span
          title={pushEnabled ? 'Push notifications enabled' : 'Push notifications off'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (pushEnabled) disablePush()
            else enablePush()
          }}
          className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ring-2 ring-slate-950 transition-colors ${
            pushEnabled ? 'bg-emerald-400' : 'bg-slate-600'
          }`}
        />
      </Link>
    </div>
  )
}
