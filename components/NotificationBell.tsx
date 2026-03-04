'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell }                                       from 'lucide-react'
import { NotificationPanel }                          from './NotificationPanel'

// Convert base64url → Uint8Array (required for PushManager.subscribe)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function NotificationBell() {
  const [open,        setOpen]        = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pushEnabled, setPushEnabled] = useState(false)
  const wrapperRef                    = useRef<HTMLDivElement>(null)

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

  // Reset unread indicator when panel is opened
  useEffect(() => {
    if (open) {
      // Delay the reset slightly so the badge is visible as the panel opens
      const t = setTimeout(() => setUnreadCount(0), 1500)
      return () => clearTimeout(t)
    }
  }, [open])

  // ── Register Service Worker + attempt push subscription ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[push] SW registration failed:', err)
    })

    // Restore push state
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      if (existing) setPushEnabled(true)
    }).catch(() => {})
  }, [])

  // ── Subscribe to push notifications ───────────────────────────────────────
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('Notification permission denied.')
        return
      }

      const keyRes = await fetch('/api/push/vapid-key')
      if (!keyRes.ok) { alert('Push notifications are not configured on this server.'); return }
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
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
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
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className={`relative p-2 rounded-xl transition-colors ${
          open
            ? 'bg-slate-700 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center
                           rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Push toggle below the bell (small) */}
      <button
        onClick={pushEnabled ? disablePush : enablePush}
        title={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
        className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full
                    transition-colors ${pushEnabled ? 'bg-green-400' : 'bg-slate-600'}`}
      />

      {/* Panel */}
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  )
}
