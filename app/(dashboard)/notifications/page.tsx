'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Mail, Smartphone, Folder, Save, Check, Loader2 } from 'lucide-react'

type NotificationCategory =
  | 'UPLOAD_IN_FOLLOWED_FOLDER'
  | 'FILE_STATUS_CHANGED'
  | 'NEW_EVENT_CREATED'
  | 'FILE_RESTORED'
  | 'WEEKLY_DIGEST'
  | 'FILE_PUBLISHED_ALERT'
  | 'STORAGE_THRESHOLD_ALERT'

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
}

interface Pref  { push: boolean; email: boolean }
interface Event { id: string; name: string }

export default function NotificationPreferencesPage() {
  const [prefs,            setPrefs]            = useState<Record<NotificationCategory, Pref>>({} as never)
  const [followedEventIds, setFollowedEventIds] = useState<string[]>([])
  const [allEvents,        setAllEvents]        = useState<Event[]>([])
  const [loading,          setLoading]          = useState(true)
  const [saving,           setSaving]           = useState(false)
  const [saved,            setSaved]            = useState(false)
  const [role,             setRole]             = useState<string>('')

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

  // ── Toggle a preference ──────────────────────────────────────────────────
  function toggle(cat: NotificationCategory, channel: 'push' | 'email') {
    setPrefs((prev) => ({
      ...prev,
      [cat]: {
        ...(prev[cat] ?? { push: true, email: true }),
        [channel]: !(prev[cat]?.[channel] ?? true),
      },
    }))
  }

  // ── Toggle a folder follow ────────────────────────────────────────────────
  function toggleFollow(eventId: string) {
    setFollowedEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  // ── Save preferences ─────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      await fetch('/api/preferences/notifications', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ preferences: prefs, followedEventIds }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading preferences…
      </div>
    )
  }

  const visibleCats = (Object.entries(CATEGORIES) as [NotificationCategory, CategoryMeta][])
    .filter(([, meta]) => !meta.adminOnly || role === 'ADMIN')

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Notification Preferences</h1>
        <p className="mt-1 text-slate-400">
          Control which notifications you receive, and which event folders you follow.
        </p>
      </div>

      {/* ── Channel toggles ──────────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Notification Channels</h2>
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

        {visibleCats.map(([cat, meta]) => {
          const pushOn  = prefs[cat]?.push  ?? true
          const emailOn = prefs[cat]?.email ?? true

          return (
            <div key={cat} className="grid grid-cols-[1fr_auto_auto] items-center px-6 py-4 border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 transition-colors">
              <div>
                <p className="text-sm font-medium text-white">{meta.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
              </div>
              <div className="flex gap-8 pr-0">
                {/* Push toggle */}
                <div className="w-8 flex justify-center">
                  {meta.hasPush ? (
                    <Toggle enabled={pushOn} onToggle={() => toggle(cat, 'push')} />
                  ) : (
                    <span className="text-slate-700 text-xs">—</span>
                  )}
                </div>
                {/* Email toggle */}
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
        })}
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

      {/* ── Save button ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500
                     disabled:bg-indigo-900 disabled:text-indigo-600 disabled:cursor-not-allowed
                     px-5 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save preferences
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
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
