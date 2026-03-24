'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image             from 'next/image'
import Link              from 'next/link'
import { useSession }    from 'next-auth/react'
import {
  UploadCloud, Film, ImageIcon, Users, FileText, HardDrive, Clock,
  TrendingUp, CheckCircle2, Circle, Loader2, RefreshCw, ArrowRight,
  CalendarDays, Zap, AlertTriangle, Star, BarChart3, MessageSquare,
  Folder, ChevronRight, CheckCheck,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'ADMIN' | 'EDITOR' | 'UPLOADER'

interface AdminStats { totalFiles: number; weekUploads: number; pendingEdit: number; activeToday: number; monthChangePct: number | null }
interface EditorStats { filesToEdit: number; editedThisMonth: number; transfersWaiting: number }
interface UploaderStats { myTotal: number; myWeek: number; myEvents: number }

interface RecentFile {
  id: string; originalName: string; fileType: 'PHOTO' | 'VIDEO'
  fileSize: string; status: string; createdAt: string; thumbnailUrl: string | null
  uploader: { name: string | null; username: string | null } | null
  event:    { id: string; name: string } | null
}

interface ActivityItem {
  id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string
  user:      { name: string | null; username: string | null } | null
  mediaFile: { originalName: string; event: { name: string } | null } | null
  event:     { name: string } | null
}

interface UpcomingEvent {
  id: string; name: string; date: string | null
  category: { name: string; year: { year: number } } | null
  _count: { mediaFiles: number }
}

interface Storage {
  totalBytes: string
  breakdown: { type: string; bytes: string; count: number }[]
}

interface OnboardingStatus {
  dismissed: boolean
  items: { uploaded: boolean; installedPwa: boolean; setNotifications: boolean; exploredEvents: boolean; askedZara: boolean }
  completedCount: number
  totalCount: number
}

interface DashboardData {
  role:           Role
  stats:          AdminStats | EditorStats | UploaderStats
  recentUploads:  RecentFile[]
  activity:       ActivityItem[]
  upcomingEvents: UpcomingEvent[]
  storage:        Storage | null
  onboarding:     OnboardingStatus
  generatedAt:    string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)       return 'just now'
  if (secs < 3600)     return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400)    return `${Math.floor(secs / 3600)}h ago`
  if (secs < 172800)   return 'Yesterday'
  return `${Math.floor(secs / 86400)}d ago`
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)          return `${bytes} B`
  if (bytes < 1_048_576)     return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

function displayName(user: { name: string | null; username: string | null } | null): string {
  return user?.name ?? user?.username ?? 'Someone'
}

const ACTION_MAP: Record<string, (item: ActivityItem) => { icon: string; text: string }> = {
  FILE_UPLOADED:  i => ({ icon: '📁', text: `${displayName(i.user)} uploaded ${i.mediaFile?.originalName ?? 'a file'}${i.mediaFile?.event ? ` to ${i.mediaFile.event.name}` : ''}` }),
  FILE_DELETED:   i => ({ icon: '🗑️', text: `${displayName(i.user)} deleted ${i.mediaFile?.originalName ?? 'a file'}` }),
  FILE_ARCHIVED:  i => ({ icon: '📦', text: `${displayName(i.user)} archived ${i.mediaFile?.originalName ?? 'a file'}` }),
  STATUS_CHANGED: i => ({ icon: '✅', text: `${displayName(i.user)} marked ${i.mediaFile?.originalName ?? 'a file'} as ${(i.metadata as any)?.newStatus ?? 'updated'}` }),
  FILE_RESTORED:  i => ({ icon: '🔄', text: `${displayName(i.user)} restored ${i.mediaFile?.originalName ?? 'a file'}` }),
  VERSION_UPLOADED:i=>({ icon: '📝', text: `${displayName(i.user)} uploaded a new version of ${i.mediaFile?.originalName ?? 'a file'}` }),
  TRANSFER_SENT:  i => ({ icon: '📤', text: `${displayName(i.user)} sent a file transfer` }),
  TRANSFER_COMPLETED: i => ({ icon: '✔️', text: `Transfer completed by ${displayName(i.user)}` }),
  USER_LOGIN:     i => ({ icon: '👤', text: `${displayName(i.user)} logged in` }),
  USER_LOGIN_SUCCESS: i => ({ icon: '👤', text: `${displayName(i.user)} logged in` }),
  EVENT_CREATED:  i => ({ icon: '🗂️', text: `${displayName(i.user)} created event${i.event ? ` "${i.event.name}"` : ''}` }),
  EVENT_UPDATED:  i => ({ icon: '🗂️', text: `${displayName(i.user)} updated event${i.event ? ` "${i.event.name}"` : ''}` }),
  SHARE_LINK_CREATED: i => ({ icon: '🔗', text: `${displayName(i.user)} created a share link` }),
  MESSAGE_SENT:   i => ({ icon: '💬', text: `${displayName(i.user)} sent a message` }),
  MEDIA_UPLOADED: i => ({ icon: '📁', text: `${displayName(i.user)} uploaded ${i.mediaFile?.originalName ?? 'a file'}` }),
}

function formatActivity(item: ActivityItem): { icon: string; text: string } {
  const fn = ACTION_MAP[item.action]
  if (fn) return fn(item)
  // Generic fallback
  const cleanAction = item.action.replace(/_/g, ' ').toLowerCase()
  return { icon: '⚡', text: `${displayName(item.user)} — ${cleanAction}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, href, accentClass = 'text-indigo-400',
}: {
  icon:         React.ReactNode
  label:        string
  value:        string | number
  sub?:         string
  href?:        string
  accentClass?: string
}) {
  const inner = (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-5 flex items-start gap-4
                    hover:border-slate-700/80 transition-colors group">
      <div className={`w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 ${accentClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-white tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

// ── Welcome banner ────────────────────────────────────────────────────────────
function WelcomeBanner({ name }: { name: string }) {
  const [greeting, setGreeting] = useState('Good morning')
  const [emoji,   setEmoji]    = useState('☀️')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
    setEmoji(   h < 12 ? '☀️' : h < 18 ? '⛅' : '🌙')
  }, [])
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-white">
        {greeting}, {name} {emoji}
      </h1>
      <p className="mt-1 text-slate-400 text-sm sm:text-base">
        Here's what's happening in Christhood today.
      </p>
    </div>
  )
}

// ── Onboarding checklist ──────────────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { key: 'uploaded',         label: 'Upload your first file',           href: '/upload' },
  { key: 'installedPwa',     label: 'Install the app on your phone',    href: '/profile' },
  { key: 'setNotifications', label: 'Set your notification preferences', href: '/notifications' },
  { key: 'exploredEvents',   label: 'Explore the event folders',         href: '/events' },
  { key: 'askedZara',        label: 'Try asking Zara a question',        href: '#zara' },
] as const

function OnboardingChecklist({
  onboarding, onDismiss,
}: { onboarding: OnboardingStatus; onDismiss: () => void }) {
  const { items, completedCount, totalCount } = onboarding
  const pct = Math.round((completedCount / totalCount) * 100)

  return (
    <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-indigo-400" />
            Getting Started
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">{completedCount} of {totalCount} complete</p>
        </div>
        {completedCount === totalCount && (
          <button
            onClick={onDismiss}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <ul className="space-y-3">
        {CHECKLIST_ITEMS.map(c => {
          const done = items[c.key]
          return (
            <li key={c.key} className="flex items-center gap-3">
              {done
                ? <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                : <Circle       className="w-4 h-4 text-slate-600   shrink-0" />}
              <span className={`text-sm flex-1 ${done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                {c.label}
              </span>
              {!done && (
                <Link href={c.href} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-0.5">
                  Do it <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>

      {completedCount === totalCount && (
        <div className="mt-4 pt-4 border-t border-indigo-500/20">
          <div className="flex items-center gap-2 text-indigo-300">
            <CheckCheck className="w-4 h-4" />
            <span className="text-sm font-medium">You're all set! Dismiss this when you're ready.</span>
          </div>
          <button
            onClick={onDismiss}
            className="mt-3 px-4 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50
                       border border-indigo-500/30 text-sm text-indigo-200 transition-colors"
          >
            Dismiss checklist
          </button>
        </div>
      )}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-400" />
        Recent Activity
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600 py-4 text-center">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {items.map(item => {
            const { icon, text } = formatActivity(item)
            return (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <span className="text-lg mt-0.5 shrink-0" aria-hidden>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 leading-snug line-clamp-2">{text}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{timeAgo(item.createdAt)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Upcoming events ───────────────────────────────────────────────────────────
function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-5 h-full">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-sky-400" />
        Upcoming Events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate-600 py-4 text-center">No upcoming events.</p>
      ) : (
        <ul className="space-y-2">
          {events.map(ev => {
            const noUploads = ev._count.mediaFiles === 0
            return (
              <li key={ev.id}>
                <Link
                  href={`/events/${ev.id}`}
                  className="flex items-start justify-between gap-2 p-3 rounded-xl
                             hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <p className="text-sm text-slate-200 font-medium truncate group-hover:text-white transition-colors">
                        {ev.name}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-5">
                      {ev.category?.name} · {ev.category?.year.year}
                    </p>
                    {noUploads && (
                      <span className="inline-flex items-center gap-1 mt-1 ml-5 text-xs text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        No uploads yet
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {ev.date ? (
                      <p className="text-xs text-slate-400">
                        {new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600">No date</p>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5">{ev._count.mediaFiles} files</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        href="/events"
        className="mt-4 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        View all events <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

// ── Recent uploads grid ───────────────────────────────────────────────────────
function UploadThumbnail({ file }: { file: RecentFile }) {
  const [videoErr, setVideoErr] = useState(false)

  if (file.thumbnailUrl) {
    return (
      <Image
        src={file.thumbnailUrl}
        alt={file.originalName}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover"
        unoptimized
      />
    )
  }

  if (file.fileType === 'VIDEO' && !videoErr) {
    return (
      <>
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <Film className="w-8 h-8 text-slate-600" />
        </div>
      </>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 gap-1 p-2">
      <ImageIcon className="w-6 h-6 text-slate-600" />
      <p className="text-[10px] text-slate-500 text-center truncate w-full">{file.originalName}</p>
    </div>
  )
}

function RecentUploadsGrid({ files }: { files: RecentFile[] }) {
  const STATUS_COLORS: Record<string, string> = {
    RAW:                  'bg-slate-600 text-slate-200',
    EDITING_IN_PROGRESS:  'bg-amber-500/20 text-amber-300',
    EDITED:               'bg-green-500/20 text-green-300',
    PUBLISHED:            'bg-indigo-500/20 text-indigo-300',
    ARCHIVED:             'bg-blue-500/20  text-blue-300',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-indigo-400" />
          Recent Uploads
        </h2>
        <Link href="/media" className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {files.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-12 text-center">
          <UploadCloud className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No uploads yet.</p>
          <Link href="/upload" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                                          bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors">
            Upload your first file
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map(file => (
            <Link
              key={file.id}
              href={`/media/${file.id}`}
              className="group bg-slate-900 border border-slate-800/60 rounded-xl overflow-hidden
                         hover:border-slate-600/80 hover:shadow-lg hover:shadow-black/20 transition-all"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-slate-800 overflow-hidden">
                <UploadThumbnail file={file} />
                {/* Status badge */}
                <span className={`absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded
                                  ${STATUS_COLORS[file.status] ?? 'bg-slate-700 text-slate-300'}`}>
                  {file.status.replace(/_/g, ' ')}
                </span>
              </div>
              {/* Caption */}
              <div className="p-2.5">
                <p className="text-xs text-white font-medium truncate">{file.originalName}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-500 truncate">
                    {file.uploader?.name ?? file.uploader?.username ?? 'Unknown'}
                  </span>
                  <span className="text-[10px] text-slate-600 shrink-0 ml-1">{timeAgo(file.createdAt)}</span>
                </div>
                {file.event && (
                  <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{file.event.name}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Storage overview (admin) ──────────────────────────────────────────────────
const STORAGE_COLORS = { PHOTO: '#6366f1', VIDEO: '#f59e0b', OTHER: '#64748b' }

function StorageOverview({ storage }: { storage: Storage }) {
  const total = Number(BigInt(storage.totalBytes))
  const chartData = storage.breakdown.map(b => ({
    name:  b.type,
    value: Number(BigInt(b.bytes)),
    count: b.count,
  }))

  // Estimate capacity (10 TB)
  const estimatedCapacity = 10 * 1024 * 1024 * 1024 * 1024
  const usedPct = Math.min(100, (total / estimatedCapacity) * 100)

  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-violet-400" />
          Storage Overview
        </h2>
        <Link href="/admin/analytics" className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
          Full analytics <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Donut chart */}
        <div className="shrink-0 w-32 h-32">
          <ResponsiveContainer width="100%" height={128}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%"
                   dataKey="value" paddingAngle={2}>
                {chartData.map(entry => (
                  <Cell key={entry.name} fill={STORAGE_COLORS[entry.name as keyof typeof STORAGE_COLORS] ?? STORAGE_COLORS.OTHER} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number | undefined) => fmtBytes(v ?? 0)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-white">{fmtBytes(total)} used</p>
          <p className="text-xs text-slate-500 mb-3">of estimated 10 TB capacity</p>

          {/* Usage bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${usedPct}%`, background: 'linear-gradient(90deg, #6366f1, #f59e0b)' }}
            />
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            {chartData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: STORAGE_COLORS[d.name as keyof typeof STORAGE_COLORS] ?? STORAGE_COLORS.OTHER }} />
                <span className="text-xs text-slate-400 flex-1">
                  {d.name === 'PHOTO' ? 'Photos' : d.name === 'VIDEO' ? 'Videos' : 'Other'}
                </span>
                <span className="text-xs text-slate-300 tabular-nums">{fmtBytes(d.value)}</span>
                <span className="text-xs text-slate-600 tabular-nums">({d.count.toLocaleString()})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Zara quick access ─────────────────────────────────────────────────────────
function ZaraCard() {
  const [zaraStatus, setZaraStatus] = useState<'checking' | 'online' | 'quota' | 'offline'>('checking')
  const [zaraDetail, setZaraDetail] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/assistant/health')
      .then(res => res.json())
      .then((data: { status?: string; message?: string; detail?: string }) => {
        if (data.status === 'ok') {
          setZaraStatus('online')
        } else if (data.message?.toLowerCase().includes('quota')) {
          setZaraStatus('quota')
          setZaraDetail(data.detail ?? null)
        } else {
          setZaraStatus('offline')
          setZaraDetail(data.detail ?? data.message ?? null)
        }
      })
      .catch(() => setZaraStatus('offline'))
  }, [])

  const statusInfo = {
    checking: { dot: 'bg-slate-500',              label: 'Checking…',               sub: null },
    online:   { dot: 'bg-green-400 animate-pulse', label: 'Zara is online',          sub: null },
    quota:    { dot: 'bg-amber-400',               label: 'Quota limit reached',      sub: 'Resets tomorrow — or upgrade at aistudio.google.com' },
    offline:  { dot: 'bg-red-500',                 label: 'Zara is offline',          sub: zaraDetail ?? 'Contact admin to restore' },
  }[zaraStatus]

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-zara-chat'))}
      className="w-full bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/20
                 rounded-2xl p-5 text-left hover:border-indigo-500/40 hover:from-indigo-950/80
                 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">
            Ask Zara anything →
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
            <span className="text-xs text-slate-500">{statusInfo.label}</span>
          </div>
          {statusInfo.sub && (
            <p className="text-[10px] text-red-400 mt-0.5 ml-3">{statusInfo.sub}</p>
          )}
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats sections (role-specific)
// ─────────────────────────────────────────────────────────────────────────────

function AdminStatsSection({ stats, isLoading }: { stats: AdminStats; isLoading: boolean }) {
  const v = (n: number) => isLoading ? '—' : n
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={<FileText className="w-5 h-5" />} label="Total Files"
        value={v(stats.totalFiles)}
        sub={stats.monthChangePct != null ? `${stats.monthChangePct >= 0 ? '+' : ''}${stats.monthChangePct}% this month` : undefined}
        href="/media" accentClass="text-indigo-400" />
      <StatCard icon={<UploadCloud className="w-5 h-5" />} label="This Week"
        value={isLoading ? '—' : `+${stats.weekUploads}`} sub="new uploads"
        href="/media" accentClass="text-sky-400" />
      <StatCard icon={<Clock className="w-5 h-5" />} label="Pending Edit"
        value={v(stats.pendingEdit)} sub="RAW files awaiting edit"
        href="/media?status=RAW" accentClass="text-amber-400" />
      <StatCard icon={<Users className="w-5 h-5" />} label="Active Today"
        value={v(stats.activeToday)} sub="unique users"
        href="/admin/users" accentClass="text-green-400" />
    </div>
  )
}

function EditorStatsSection({ stats, isLoading }: { stats: EditorStats; isLoading: boolean }) {
  const v = (n: number) => isLoading ? '—' : n
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <StatCard icon={<Clock className="w-5 h-5" />} label="Files to Edit"
        value={v(stats.filesToEdit)} sub="RAW files waiting"
        href="/media?status=RAW" accentClass="text-amber-400" />
      <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Edited This Month"
        value={v(stats.editedThisMonth)} sub="status changes by you"
        accentClass="text-green-400" />
      <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Transfers Waiting"
        value={v(stats.transfersWaiting)} sub="pending response"
        href="/transfers" accentClass="text-sky-400" />
    </div>
  )
}

function UploaderStatsSection({ stats, isLoading }: { stats: UploaderStats; isLoading: boolean }) {
  const v = (n: number) => isLoading ? '—' : n
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <StatCard icon={<FileText className="w-5 h-5" />} label="My Uploads"
        value={v(stats.myTotal)} sub="total files uploaded"
        href="/media" accentClass="text-indigo-400" />
      <StatCard icon={<UploadCloud className="w-5 h-5" />} label="This Week"
        value={isLoading ? '—' : `+${stats.myWeek}`} sub="files this week"
        href="/media" accentClass="text-sky-400" />
      <StatCard icon={<Folder className="w-5 h-5" />} label="My Events"
        value={v(stats.myEvents)} sub="events with my uploads"
        href="/events" accentClass="text-amber-400" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const { data: session } = useSession()
  const [data,          setData]          = useState<DashboardData>(initialData)
  const [lastUpdated,   setLastUpdated]   = useState(new Date())
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  const [secsSince,     setSecsSince]     = useState(0)
  // False until the first successful client-side fetch completes.
  // Prevents the SSR-fallback zeros from flashing as real data.
  const [hasRealData,   setHasRealData]   = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (silent = true) => {
    if (document.hidden) return
    if (!silent) setIsRefreshing(true)
    try {
      const res = await fetch('/api/dashboard', { credentials: 'include' })
      if (res.ok) {
        const fresh = await res.json() as DashboardData
        setData(fresh)
        setLastUpdated(new Date())
        setSecsSince(0)
        setHasRealData(true)
      }
    } catch { /* ignore network errors */ }
    finally { if (!silent) setIsRefreshing(false) }
  }, [])

  // 15-second auto-refresh; paused when tab is hidden
  useEffect(() => {
    // Immediately fetch real data on mount — SSR fallback may have given zeros
    // if the server-side internal fetch failed (common in production).
    refresh(true)

    const tick = () => setSecsSince(s => s + 1)
    const clock = setInterval(tick, 1000)

    const scheduleRefresh = () => {
      intervalRef.current = setInterval(() => refresh(true), 15000)
    }
    scheduleRefresh()

    const onVisibility = () => {
      if (!document.hidden) {
        refresh(true)  // refresh immediately on tab focus
        if (!intervalRef.current) scheduleRefresh()
      } else {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(clock)
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  // Dismiss onboarding checklist
  const dismissChecklist = useCallback(async () => {
    try {
      await fetch('/api/user/onboarding', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
    } catch { /* ignore */ }
    setData(prev => ({ ...prev, onboarding: { ...prev.onboarding, dismissed: true } }))
  }, [])

  const { role, stats, recentUploads, activity, upcomingEvents, storage, onboarding } = data
  const isAdmin  = role === 'ADMIN'
  const isEditor = role === 'EDITOR'
  const name     = session?.user?.name ?? (session?.user as any)?.username ?? 'there'
  const showChecklist = !onboarding.dismissed

  return (
    <div className="space-y-8 max-w-7xl">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {showChecklist
            ? (
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Welcome to Christhood CMMS 👋</h1>
                <p className="mt-1 text-slate-400 text-sm">Let's get you set up.</p>
              </div>
            )
            : <WelcomeBanner name={name} />
          }
        </div>
        {/* Last updated indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
          <button
            onClick={() => refresh(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-50"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <span suppressHydrationWarning>
            Updated {secsSince === 0 ? 'just now' : `${secsSince}s ago`}
          </span>
        </div>
      </div>

      {/* ── Section 1: Onboarding checklist ────────────────────────────────── */}
      {showChecklist && (
        <OnboardingChecklist onboarding={onboarding} onDismiss={dismissChecklist} />
      )}

      {/* ── Section 2: Stats cards ──────────────────────────────────────────── */}
      {isAdmin  && <AdminStatsSection    stats={stats as AdminStats}    isLoading={!hasRealData} />}
      {isEditor && <EditorStatsSection   stats={stats as EditorStats}   isLoading={!hasRealData} />}
      {!isAdmin && !isEditor && <UploaderStatsSection stats={stats as UploaderStats} isLoading={!hasRealData} />}

      {/* ── Sections 3 + 5: Activity feed + Upcoming events ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed items={activity} />
        </div>
        <div className="flex flex-col gap-6">
          {(isAdmin || isEditor) && upcomingEvents.length > 0 && (
            <UpcomingEvents events={upcomingEvents} />
          )}
          <ZaraCard />
        </div>
      </div>

      {/* ── Section 4: Recent uploads ────────────────────────────────────────── */}
      <RecentUploadsGrid files={recentUploads} />

      {/* ── Section 6: Storage overview (admin only) ─────────────────────────── */}
      {isAdmin && storage && <StorageOverview storage={storage} />}

    </div>
  )
}
