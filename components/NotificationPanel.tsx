'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { X, Bell, CheckCheck, MessageSquare } from 'lucide-react'

interface NotificationItem {
  id:          string
  itemType:    'notification' | 'message'
  message:     string
  subject?:    string
  senderName?: string
  priority?:   'NORMAL' | 'URGENT'
  link:        string | null
  read:        boolean
  createdAt:   string
}

interface Props {
  onClose: () => void
}

export function NotificationPanel({ onClose }: Props) {
  const [items,   setItems]   = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const panelRef              = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res  = await fetch('/api/notifications?limit=30')
      const data = await res.json()
      setItems(data.notifications ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  async function markRead(item: NotificationItem) {
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
    if (item.itemType === 'message') {
      await fetch(`/api/messages/${item.id}/read`, { method: 'PATCH' })
    } else {
      await fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' })
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await fetch('/api/notifications/mark-all-read', { method: 'POST' })
  }

  const unread = items.filter((n) => !n.read).length

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[520px] flex flex-col
                 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40
                 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/80 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Notifications</span>
          {unread > 0 && (
            <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              title="Mark all read"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
            Loading…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Bell className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">You're all caught up!</p>
          </div>
        )}

        {!loading && items.map((n) => {
          const isUrgentMsg  = n.itemType === 'message' && n.priority === 'URGENT'
          const dotColor     = n.read ? 'bg-transparent' : isUrgentMsg ? 'bg-red-400' : 'bg-indigo-400'
          const rowBg        = n.read
            ? 'hover:bg-slate-800/40'
            : isUrgentMsg
              ? 'bg-red-950/20 hover:bg-red-950/30'
              : 'bg-indigo-950/30 hover:bg-indigo-950/50'

          const inner = (
            <div
              className={`flex gap-3 px-4 py-3 border-b border-slate-800/60 transition-colors cursor-pointer ${rowBg}`}
              onClick={() => { if (!n.read) markRead(n) }}
            >
              {/* Unread indicator dot */}
              <div className="mt-1.5 shrink-0">
                <div className={`w-2 h-2 rounded-full ${dotColor}`} />
              </div>

              <div className="flex-1 min-w-0">
                {/* Message-type tag row */}
                {n.itemType === 'message' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      isUrgentMsg ? 'text-red-400' : 'text-indigo-400'
                    }`}>
                      {isUrgentMsg ? 'Urgent Message' : 'Message'}
                    </span>
                  </div>
                )}

                <p className={`text-sm leading-snug ${n.read ? 'text-slate-400' : 'text-white'}`}>
                  {n.message}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          )

          return n.link ? (
            <Link key={`${n.itemType}-${n.id}`} href={n.link} onClick={() => { markRead(n); onClose() }}>
              {inner}
            </Link>
          ) : (
            <div key={`${n.itemType}-${n.id}`}>{inner}</div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2.5 border-t border-slate-700/80 flex justify-center">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Manage notification preferences →
        </Link>
      </div>
    </div>
  )
}
