'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ActivitySquare, ChevronLeft, ChevronRight, Filter, Loader2,
  RefreshCw, ShieldAlert, X,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LogUser      { id: string; username: string | null; email: string; role: string }
interface LogFile      { id: string; originalName: string; storedName: string; fileType: string }
interface LogEvent     { id: string; name: string }

interface LogEntry {
  id:          string
  action:      string
  userId:      string
  mediaFileId: string | null
  eventId:     string | null
  metadata:    Record<string, unknown> | null
  createdAt:   string
  user:        LogUser
  mediaFile:   LogFile  | null
  event:       LogEvent | null
}

interface PageData {
  items: LogEntry[]
  total: number
  page:  number
  limit: number
  pages: number
}

interface SimpleUser { id: string; username: string | null; email: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_OPTIONS = [
  'FILE_UPLOADED',
  'FILE_DOWNLOADED',
  'FILE_DELETED',
  'FILE_RESTORED',
  'STATUS_CHANGED',
  'BATCH_DOWNLOADED',
  'FOLDER_CREATED',
  'YEAR_CREATED',   'YEAR_DELETED',
  'CATEGORY_CREATED', 'CATEGORY_DELETED',
  'EVENT_CREATED',  'EVENT_UPDATED',  'EVENT_DELETED',
  'SUBFOLDER_CREATED', 'SUBFOLDER_UPDATED', 'SUBFOLDER_DELETED',
  'USER_CREATED',
  'USER_LOGIN',
  'ROLE_CHANGED',
  // legacy
  'MEDIA_UPLOADED',
  'MEDIA_DOWNLOADED',
]

const ACTION_COLORS: Record<string, string> = {
  FILE_UPLOADED:       'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MEDIA_UPLOADED:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FILE_DOWNLOADED:     'bg-sky-500/15 text-sky-300 border-sky-500/30',
  MEDIA_DOWNLOADED:    'bg-sky-500/15 text-sky-300 border-sky-500/30',
  BATCH_DOWNLOADED:    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  FILE_DELETED:        'bg-red-500/15 text-red-300 border-red-500/30',
  FILE_RESTORED:       'bg-teal-500/15 text-teal-300 border-teal-500/30',
  STATUS_CHANGED:      'bg-amber-500/15 text-amber-300 border-amber-500/30',
  FOLDER_CREATED:      'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  YEAR_CREATED:        'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  YEAR_DELETED:        'bg-rose-500/15 text-rose-300 border-rose-500/30',
  CATEGORY_CREATED:    'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  CATEGORY_DELETED:    'bg-rose-500/15 text-rose-300 border-rose-500/30',
  EVENT_CREATED:       'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  EVENT_UPDATED:       'bg-blue-500/15 text-blue-300 border-blue-500/30',
  EVENT_DELETED:       'bg-rose-500/15 text-rose-300 border-rose-500/30',
  SUBFOLDER_CREATED:   'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  SUBFOLDER_UPDATED:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  SUBFOLDER_DELETED:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
  USER_CREATED:        'bg-violet-500/15 text-violet-300 border-violet-500/30',
  USER_LOGIN:          'bg-slate-500/15 text-slate-300 border-slate-500/30',
  ROLE_CHANGED:        'bg-orange-500/15 text-orange-300 border-orange-500/30',
}

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function metaPreview(entry: LogEntry): string {
  const m = entry.metadata
  if (!m) return '—'
  const parts: string[] = []
  if (m.fileName)          parts.push(`file: ${m.fileName}`)
  else if (m.originalName) parts.push(`file: ${m.originalName}`)
  else if (m.storedName)   parts.push(`stored: ${m.storedName}`)
  if (m.oldStatus && m.newStatus) parts.push(`${m.oldStatus} → ${m.newStatus}`)
  if (m.oldRole   && m.newRole)   parts.push(`${m.oldRole} → ${m.newRole}`)
  if (m.folderName)  parts.push(`"${m.folderName}"`)
  if (m.eventName)   parts.push(String(m.eventName))
  if (m.fileCount)   parts.push(`${m.fileCount} files`)
  if (m.ipAddress)   parts.push(`ip: ${m.ipAddress}`)
  return parts.join(' · ') || JSON.stringify(m).slice(0, 80)
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminLogsPage() {
  const [data,     setData]     = useState<PageData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [users,    setUsers]    = useState<SimpleUser[]>([])

  // Filters
  const [action,   setAction]   = useState('')
  const [userId,   setUserId]   = useState('')
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [page,     setPage]     = useState(1)
  const LIMIT = 50

  // ── Fetch user list for dropdown ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then((d: SimpleUser[] | { users: SimpleUser[] }) =>
        setUsers(Array.isArray(d) ? d : d.users ?? [])
      )
      .catch(() => {})
  }, [])

  // ── Fetch logs ──────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (pg = page) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) })
    if (action)  params.set('action',  action)
    if (userId)  params.set('userId',  userId)
    if (from)    params.set('from',    from)
    if (to)      params.set('to',      to)

    try {
      const res = await fetch(`/api/admin/logs?${params}`)
      const d   = await res.json() as PageData
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [action, userId, from, to, page])

  useEffect(() => { fetchLogs(page) }, [page])  // re-run when page changes

  function applyFilters() { setPage(1); fetchLogs(1) }

  function clearFilters() {
    setAction(''); setUserId(''); setFrom(''); setTo('')
    setPage(1)
    // fetchLogs would be triggered by state change but we call it directly too
    setTimeout(() => fetchLogs(1), 0)
  }

  const hasFilters = !!(action || userId || from || to)

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-violet-500/20 bg-violet-600/15 p-3">
              <ActivitySquare className="h-5 w-5 text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Audit trail</p>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Activity Log</h1>
              <p className="max-w-2xl text-sm text-slate-400">
                A read-only record of important actions, grouped here so admin review is quick and easy to scan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" />
            Logs cannot be deleted
            </span>
            <button
              onClick={() => fetchLogs(page)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filters</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-white transition"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Action */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Action type</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                         text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All actions</option>
              {ACTION_OPTIONS.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* User */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">User</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                         text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username ?? u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">From date</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                         text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">To date</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                         text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={applyFilters}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Apply filters
          </button>
          <p className="text-xs text-slate-500">
            Use filters to narrow down file uploads, downloads, transfers, and account activity.
          </p>
        </div>
      </div>

      {/* ── Results summary ──────────────────────────────────────────────────── */}
      {data && (
        <p className="text-xs text-slate-500">
          {data.total.toLocaleString()} entr{data.total === 1 ? 'y' : 'ies'} found
          {hasFilters ? ' (filtered)' : ''}
          {' ·'} page {data.page} of {data.pages || 1}
        </p>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading log entries…
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600">
            <ActivitySquare className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No log entries match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    File / Event
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-slate-800/40 hover:bg-slate-800/30 transition
                      ${idx % 2 === 0 ? '' : 'bg-slate-900/20'}`}
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                      {formatDate(entry.createdAt)}
                    </td>

                    {/* Action badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium
                                        border ${actionColor(entry.action)}`}>
                        {entry.action}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="text-white text-xs font-medium">
                        {entry.user?.username ?? '—'}
                      </div>
                      <div className="text-slate-500 text-xs truncate max-w-[160px]">
                        {entry.user?.email}
                      </div>
                    </td>

                    {/* File / Event */}
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px]">
                      {entry.mediaFile ? (
                        <div>
                          <div className="text-white truncate max-w-[190px]">
                            {entry.mediaFile.originalName}
                          </div>
                          <div className="text-slate-600 text-xs">{entry.mediaFile.fileType}</div>
                        </div>
                      ) : entry.event ? (
                        <span className="text-indigo-400 truncate block max-w-[190px]">
                          {entry.event.name}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Metadata preview */}
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[260px]">
                      <span className="truncate block" title={JSON.stringify(entry.metadata)}>
                        {metaPreview(entry)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                       bg-slate-800 text-slate-300 border border-slate-700
                       hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          {/* Page numbers — show up to 7 around current page */}
          {Array.from({ length: data.pages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - page) <= 3 || p === 1 || p === data.pages)
            .reduce<(number | '…')[]>((acc, p, i, arr) => {
              if (i > 0 && (arr[i - 1] as number) < p - 1) acc.push('…')
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-2 text-slate-600">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  disabled={loading}
                  className={`w-9 h-9 rounded-xl text-sm font-medium transition
                    ${page === p
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    } disabled:cursor-not-allowed`}
                >
                  {p}
                </button>
              )
            )
          }

          <button
            onClick={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page === data.pages || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                       bg-slate-800 text-slate-300 border border-slate-700
                       hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
