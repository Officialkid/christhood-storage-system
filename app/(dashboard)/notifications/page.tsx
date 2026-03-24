'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter }      from 'next/navigation'
import {
  Bell, Mail, Smartphone, Folder, Check, Loader2, ArrowLeftRight, AlertCircle,
  Upload, FileEdit, CheckCircle2, Trash2, RefreshCw, CheckCheck, XCircle,
  MessageSquare, FolderPlus, Flag, Reply, ExternalLink,
  Inbox as InboxIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ── Inbox notification item type ──────────────────────────────────────────────
interface NotificationItem {
  id:          string
  itemType:    'notification' | 'message'
  type?:       string
  title?:      string
  message:     string
  senderName?: string
  priority?:   'NORMAL' | 'URGENT'
  link:        string | null
  read:        boolean
  createdAt:   string
}

type NotificationCategory =
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

interface CategoryMeta {
  label:       string
  description: string
  hasPush:     boolean
  hasEmail:    boolean
  adminOnly?:  boolean
}

const CATEGORIES: Record<NotificationCategory, CategoryMeta> = {
  UPLOAD_IN_FOLLOWED_FOLDER: {
    label:       'New uploads in followed folders',
    description: 'Get notified when someone uploads files to an event folder you follow.',
    hasPush:     true,
    hasEmail:    false,
  },
  FILE_STATUS_CHANGED: {
    label:       'File status changes',
    description: "Get notified when a media file's status is updated (e.g. RAW → Edited).",
    hasPush:     true,
    hasEmail:    false,
  },
  NEW_EVENT_CREATED: {
    label:       'New event created',
    description: 'Get notified when a new event folder is created.',
    hasPush:     true,
    hasEmail:    false,
  },
  FILE_RESTORED: {
    label:       'File restored from Trash',
    description: 'Get notified when a deleted file is recovered.',
    hasPush:     true,
    hasEmail:    false,
  },
  FILE_PUBLISHED_ALERT: {
    label:       'File published',
    description: 'Get notified when a file is marked Published — useful for editors and leads.',
    hasPush:     true,
    hasEmail:    true,
  },
  WEEKLY_DIGEST: {
    label:       'Weekly digest',
    description: 'Receive a Monday morning email summary of all uploads from the past week.',
    hasPush:     false,
    hasEmail:    true,
  },
  STORAGE_THRESHOLD_ALERT: {
    label:       'Storage threshold alert',
    description: 'Receive an email when R2 storage crosses the configured threshold.',
    hasPush:     false,
    hasEmail:    true,
    adminOnly:   true,
  },
  TRANSFER_RECEIVED: {
    label:       'Transfer received',
    description: 'Get notified when someone sends you files via a transfer request.',
    hasPush:     true,
    hasEmail:    true,
  },
  TRANSFER_RESPONDED: {
    label:       'Transfer responded',
    description: 'Get notified when a recipient uploads their edited files back to your transfer.',
    hasPush:     true,
    hasEmail:    true,
  },
  TRANSFER_COMPLETED: {
    label:       'Transfer completed',
    description: 'Get notified when a transfer is marked completed by the sender.',
    hasPush:     true,
    hasEmail:    false,
  },
  TRANSFER_CANCELLED: {
    label:       'Transfer cancelled',
    description: 'Get notified when a transfer is cancelled.',
    hasPush:     true,
    hasEmail:    false,
  },
  DIRECT_MESSAGE: {
    label:       'Direct messages',
    description: 'Get notified when you receive a direct message from an admin.',
    hasPush:     true,
    hasEmail:    true,
  },
}

interface Pref  { push: boolean; email: boolean }
interface Event { id: string; name: string }

// Convert base64url → Uint8Array for PushManager.subscribe
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

// ── Notification type icon ────────────────────────────────────────────────────
function NotifTypeIcon({ type, itemType, priority }: {
  type?: string; itemType: string; priority?: string
}) {
  const cls = 'w-4 h-4 shrink-0'
  if (itemType === 'message') {
    return priority === 'URGENT'
      ? <MessageSquare className={`${cls} text-red-400`} />
      : <MessageSquare className={`${cls} text-indigo-400`} />
  }
  switch (type) {
    case 'FILE_UPLOADED':        return <Upload        className={`${cls} text-emerald-400`} />
    case 'FILE_STATUS_CHANGED':  return <FileEdit      className={`${cls} text-amber-400`} />
    case 'FILE_PUBLISHED_ALERT': return <CheckCircle2  className={`${cls} text-emerald-400`} />
    case 'FILE_DELETED':         return <Trash2        className={`${cls} text-red-400`} />
    case 'FILE_RESTORED':        return <RefreshCw     className={`${cls} text-teal-400`} />
    case 'TRANSFER_SENT':
    case 'TRANSFER_RECEIVED':    return <InboxIcon     className={`${cls} text-violet-400`} />
    case 'TRANSFER_RESPONDED':   return <Reply         className={`${cls} text-sky-400`} />
    case 'TRANSFER_COMPLETED':   return <CheckCheck    className={`${cls} text-emerald-400`} />
    case 'TRANSFER_CANCELLED':   return <XCircle       className={`${cls} text-red-400`} />
    case 'DIRECT_MESSAGE':       return <MessageSquare className={`${cls} text-blue-400`} />
    case 'NEW_EVENT_CREATED':    return <FolderPlus    className={`${cls} text-indigo-400`} />
    case 'ISSUE_FLAGGED':        return <Flag          className={`${cls} text-amber-400`} />
    default:                     return <Bell          className={`${cls} text-slate-500`} />
  }
}

// ── Single notification row ───────────────────────────────────────────────────
function NotifRow({
  item, onRead, onDelete,
}: {
  item:     NotificationItem
  onRead:   (id: string, itemType: string) => void
  onDelete: (id: string) => void
}) {
  const router   = useRouter()
  const isUrgent = item.itemType === 'message' && item.priority === 'URGENT'

  const rowBg = item.read
    ? 'hover:bg-slate-800/40'
    : isUrgent
    ? 'bg-red-950/20 hover:bg-red-950/30 border-l-2 border-l-red-500'
    : 'bg-indigo-950/20 hover:bg-indigo-950/30 border-l-2 border-l-indigo-500'

  const iconBg = item.itemType === 'message'
    ? (isUrgent ? 'bg-red-950/60' : 'bg-indigo-950/60')
    : 'bg-slate-800/60'

  function handleClick() {
    if (!item.read) onRead(item.id, item.itemType)
    if (item.link) router.push(item.link)
  }

  const heading =
    item.title ||
    (item.itemType === 'message'
      ? (isUrgent ? '🔴 Urgent Message' : `Message from ${item.senderName ?? 'Admin'}`)
      : null)

  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-3.5 border-b border-slate-800/60
                  last:border-0 transition-colors cursor-pointer min-h-[60px] ${rowBg}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {!item.read && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400" />
      )}
      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        <NotifTypeIcon type={item.type} itemType={item.itemType} priority={item.priority} />
      </div>
      <div className="flex-1 min-w-0">
        {heading && (
          <p className={`text-xs font-semibold truncate mb-0.5 ${isUrgent ? 'text-red-400' : 'text-indigo-300'}`}>
            {heading}
          </p>
        )}
        <p className={`text-sm leading-snug ${item.read ? 'text-slate-400' : 'font-medium text-white'}`}>
          {item.message}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {item.link && <ExternalLink className="w-3.5 h-3.5 text-slate-700" />}
        {item.itemType === 'notification' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            aria-label="Delete notification"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inbox section (Unread or All tab) ─────────────────────────────────────────
function InboxSection({
  tab, onUnreadCountChange,
}: {
  tab:                 'unread' | 'all'
  onUnreadCountChange: (n: number) => void
}) {
  const [items,       setItems]       = useState<NotificationItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll,  setMarkingAll]  = useState(false)
  const LIMIT = 30

  const fetchPage = useCallback(async (pg: number) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    try {
      const res    = await fetch(`/api/notifications?tab=${tab}&page=${pg}&limit=${LIMIT}`)
      const data   = await res.json()
      const fetched: NotificationItem[] = data.notifications ?? []
      setItems(prev => pg === 1 ? fetched : [...prev, ...fetched])
      setHasMore(fetched.length === LIMIT)
      const cnt = data.unreadCount ?? 0
      setUnreadCount(cnt)
      onUnreadCountChange(cnt)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [tab, onUnreadCountChange])

  useEffect(() => { fetchPage(1) }, [fetchPage])

  async function markRead(id: string, itemType: string) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    if (itemType === 'message') {
      await fetch(`/api/messages/${id}/read`, { method: 'PATCH' }).catch(() => {})
    } else {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {})
    }
    window.dispatchEvent(new CustomEvent('notifications:invalidate'))
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      onUnreadCountChange(0)
      window.dispatchEvent(new CustomEvent('notifications:invalidate'))
    } finally {
      setMarkingAll(false)
    }
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(n => n.id !== id))
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    fetchPage(next)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  const countLabel = tab === 'unread'
    ? (unreadCount === 0 ? 'No unread notifications' : `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`)
    : (items.length === 0 ? 'No notifications yet' : `${items.length}${hasMore ? '+' : ''} notification${items.length !== 1 ? 's' : ''}`)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{countLabel}</p>
        {tab === 'unread' && unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300
                       disabled:opacity-50 transition-colors"
          >
            {markingAll
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCheck className="w-3.5 h-3.5" />}
            Mark all as read
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Bell className="w-12 h-12 mb-4 text-slate-700" />
          <p className="text-base font-semibold text-slate-300">
            {tab === 'unread' ? 'You are all caught up! ✓' : 'No notifications yet.'}
          </p>
          {tab === 'unread' && (
            <p className="text-sm mt-1 text-slate-500">No unread notifications.</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {items.map(item => (
            <NotifRow
              key={`${item.itemType}-${item.id}`}
              item={item}
              onRead={markRead}
              onDelete={deleteItem}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300
                       disabled:opacity-50 py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700
                       transition-colors"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabButton({
  active, onClick, badge, children,
}: {
  active: boolean; onClick: () => void; badge?: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm
                  font-medium transition-colors ${
        active ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
      }`}
    >
      {children}
      {badge && (
        <span className="bg-indigo-500 text-white text-[10px] font-bold rounded-full
                         px-1.5 min-w-[18px] text-center leading-tight py-0.5">
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Settings section (notification preferences) ───────────────────────────────
function SettingsSection() {
  const [prefs,            setPrefs]            = useState<Record<NotificationCategory, Pref>>({} as never)
  const [followedEventIds, setFollowedEventIds] = useState<string[]>([])
  const [allEvents,        setAllEvents]        = useState<Event[]>([])
  const [loading,          setLoading]          = useState(true)
  const [saving,           setSaving]           = useState(false)
  const [saved,            setSaved]            = useState(false)
  const [saveError,        setSaveError]        = useState(false)
  const [role,             setRole]             = useState<string>('')

  // ── Push subscription state ──────────────────────────────────────────────
  const [pushSupported,    setPushSupported]    = useState(false)
  const [pushSubscribed,   setPushSubscribed]   = useState(false)
  const [pushLoading,      setPushLoading]      = useState(false)

  // ── Auto-save debounce timer ─────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch current preferences ────────────────────────────────────────────
  const fetchPrefs = useCallback(async () => {
    setLoading(true)
    try {
      const [prefsRes, sessionRes] = await Promise.all([
        fetch('/api/preferences/notifications'),
        fetch('/api/auth/session'),
      ])
      const prefsData   = await prefsRes.json()
      const sessionData = await sessionRes.json()

      setPrefs(prefsData.preferences ?? {})
      setFollowedEventIds(prefsData.followedEventIds ?? [])
      setAllEvents(prefsData.allEvents ?? [])
      setRole(sessionData?.user?.role ?? '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPrefs() }, [fetchPrefs])

  // ── Detect push subscription status on mount ────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushSupported(true)
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setPushSubscribed(!!sub)
    }).catch(() => {})
  }, [])

  // ── Subscribe to push notifications ──────────────────────────────────────
  async function enablePush() {
    if (!pushSupported) return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const keyRes = await fetch('/api/push/vapid-key')
      if (!keyRes.ok) return
      const { publicKey } = await keyRes.json()

      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
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
      setPushSubscribed(true)
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
    } finally {
      setPushLoading(false)
    }
  }

  // ── Unsubscribe from push notifications ───────────────────────────────────
  async function disablePush() {
    if (!pushSupported) return
    setPushLoading(true)
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
      setPushSubscribed(false)
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
    } finally {
      setPushLoading(false)
    }
  }

  // ── Core save (used by both auto-save and manual button) ──────────────────
  async function performSave(
    savePrefs:    Record<NotificationCategory, Pref>,
    saveFollowed: string[],
  ) {
    setSaving(true)
    setSaveError(false)
    try {
      const res = await fetch('/api/preferences/notifications', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ preferences: savePrefs, followedEventIds: saveFollowed }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setSaveError(true)
        setTimeout(() => setSaveError(false), 5000)
      }
    } catch {
      setSaveError(true)
      setTimeout(() => setSaveError(false), 5000)
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle a preference — auto-saves after 800 ms ─────────────────────────
  function toggle(cat: NotificationCategory, channel: 'push' | 'email') {
    const newPrefs = {
      ...prefs,
      [cat]: {
        ...(prefs[cat] ?? { push: true, email: true }),
        [channel]: !(prefs[cat]?.[channel] ?? true),
      },
    }
    setPrefs(newPrefs)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => performSave(newPrefs, followedEventIds), 800)
  }

  // ── Toggle a folder follow — auto-saves after 800 ms ──────────────────────
  function toggleFollow(eventId: string) {
    const newFollowed = followedEventIds.includes(eventId)
      ? followedEventIds.filter((id) => id !== eventId)
      : [...followedEventIds, eventId]
    setFollowedEventIds(newFollowed)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => performSave(prefs, newFollowed), 800)
  }

  // ── Manual save (cancels any pending auto-save and saves immediately) ──────
  async function save() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await performSave(prefs, followedEventIds)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading preferences…
      </div>
    )
  }

  const SYSTEM_CATS: NotificationCategory[] = [
    'UPLOAD_IN_FOLLOWED_FOLDER',
    'FILE_STATUS_CHANGED',
    'NEW_EVENT_CREATED',
    'FILE_RESTORED',
    'FILE_PUBLISHED_ALERT',
    'WEEKLY_DIGEST',
    'STORAGE_THRESHOLD_ALERT',
  ]
  const COMMS_CATS: NotificationCategory[] = [
    'TRANSFER_RECEIVED',
    'TRANSFER_RESPONDED',
    'TRANSFER_COMPLETED',
    'TRANSFER_CANCELLED',
    'DIRECT_MESSAGE',
  ]

  const visibleSys   = SYSTEM_CATS.filter((cat) => {
    const meta = CATEGORIES[cat]
    return !meta.adminOnly || role === 'ADMIN'
  })
  const visibleComms = COMMS_CATS

  // Reusable row renderer
  function CategoryRow({ cat }: { cat: NotificationCategory }) {
    const meta    = CATEGORIES[cat]
    const pushOn  = prefs[cat]?.push  ?? true
    const emailOn = prefs[cat]?.email ?? true
    return (
      <div key={cat} className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-4 border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 transition-colors">
        <div>
          <p className="text-sm font-medium text-white">{meta.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        <div className="flex gap-8 pr-0">
          <div className="w-8 flex justify-center">
            {meta.hasPush ? (
              <Toggle enabled={pushOn} onToggle={() => toggle(cat, 'push')} />
            ) : (
              <span className="text-slate-700 text-xs">—</span>
            )}
          </div>
          <div className="w-8 flex justify-center">
            {meta.hasEmail ? (
              <Toggle enabled={emailOn} onToggle={() => toggle(cat, 'email')} />
            ) : (
              <span className="text-slate-700 text-xs">—</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Browser Push Subscription ───────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
              pushSubscribed ? 'bg-green-400' : 'bg-slate-600'
            }`} />
            <div>
              <p className="text-sm font-semibold text-white">
                Browser push notifications&nbsp;
                <span className={`text-xs font-normal ${pushSubscribed ? 'text-green-400' : 'text-slate-500'}`}>
                  {pushSubscribed ? '— enabled on this device' : '— not enabled on this device'}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {pushSubscribed
                  ? 'This browser will receive push alerts. The toggles above control which categories are delivered.'
                  : 'Enable push to receive browser alerts for the categories toggled on above. Each device you use must be subscribed separately.'}
              </p>
              {!pushSupported && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Push notifications are not supported in this browser.
                </p>
              )}
            </div>
          </div>
          {pushSupported && (
            <button
              onClick={pushSubscribed ? disablePush : enablePush}
              disabled={pushLoading}
              className={`shrink-0 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                pushSubscribed
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {pushLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pushSubscribed ? 'Disable push' : 'Enable push'}
            </button>
          )}
        </div>
      </section>

      {/* ── System notifications ─────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">System Notifications</h2>
          </div>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-2 border-b border-slate-800/60">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Event</span>
          <div className="flex gap-8 mr-0">
            <span className="w-8 text-center text-xs font-medium text-slate-500 flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> Push
            </span>
            <span className="w-8 text-center text-xs font-medium text-slate-500 flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </span>
          </div>
        </div>

        {visibleSys.map((cat) => <CategoryRow key={cat} cat={cat} />)}
      </section>

      {/* ── Communications notifications ──────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Communications</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Transfers, responded files, and direct messages.
          </p>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-2 border-b border-slate-800/60">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Event</span>
          <div className="flex gap-8 mr-0">
            <span className="w-8 text-center text-xs font-medium text-slate-500 flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> Push
            </span>
            <span className="w-8 text-center text-xs font-medium text-slate-500 flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </span>
          </div>
        </div>

        {visibleComms.map((cat) => <CategoryRow key={cat} cat={cat} />)}
      </section>

      {/* ── Followed Folders ─────────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Followed Event Folders</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            You'll receive a push notification when new files are uploaded to these events.
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/40">
          {allEvents.length === 0 && (
            <p className="px-6 py-6 text-sm text-slate-500">No events found.</p>
          )}
          {allEvents.map((ev) => {
            const followed = followedEventIds.includes(ev.id)
            return (
              <label
                key={ev.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-slate-800/30 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={followed}
                  onChange={() => toggleFollow(ev.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500
                             focus:ring-indigo-500 focus:ring-offset-0 focus:ring-1 cursor-pointer"
                />
                <span className={`text-sm ${followed ? 'text-white' : 'text-slate-400'}`}>{ev.name}</span>
              </label>
            )
          })}
        </div>
      </section>

      {/* ── Save indicator / manual save ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-500">
          Changes are saved automatically when you toggle.
        </p>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </span>
        )}
        {saved && !saving && (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {saveError && (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5" /> Failed to save —&nbsp;
            <button onClick={save} className="underline hover:no-underline">retry</button>
          </span>
        )}
        {/* Hidden manual-save button kept for keyboard/accessibility users */}
        <button
          onClick={save}
          disabled={saving}
          className="sr-only"
          aria-label="Save preferences"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ── Simple toggle switch ──────────────────────────────────────────────────────
function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  ${enabled ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600 bg-slate-700'}`}
    >
      <span
        className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow
                    transform ring-0 transition-transform duration-100
                    ${enabled ? 'translate-x-3.5' : 'translate-x-0'}`}
        style={{ margin: '1px' }}
      />
    </button>
  )
}

// ── Main notifications page — three tabs ──────────────────────────────────────
export default function NotificationsPage() {
  const [tab,         setTab]         = useState<'unread' | 'all' | 'settings'>('unread')
  const [unreadCount, setUnreadCount] = useState(0)

  const handleCountChange = useCallback((n: number) => setUnreadCount(n), [])

  // Seed badge from the fast unread-count endpoint
  useEffect(() => {
    fetch('/api/notifications/unread-count')
      .then(r => r.json())
      .then(d => setUnreadCount(d.count ?? 0))
      .catch(() => {})
  }, [])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Notifications</h1>
        <p className="mt-1 text-slate-400">Your inbox and notification preferences.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 p-1 rounded-xl">
        <TabButton
          active={tab === 'unread'}
          onClick={() => setTab('unread')}
          badge={unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined}
        >
          Unread
        </TabButton>
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>All</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Settings</TabButton>
      </div>

      {tab === 'settings'
        ? <SettingsSection />
        : <InboxSection tab={tab} key={tab} onUnreadCountChange={handleCountChange} />
      }
    </div>
  )
}
