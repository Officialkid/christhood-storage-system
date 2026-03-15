'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Trash2, RotateCcw, Clock, AlertTriangle, Loader2,
  RefreshCw, ShieldAlert, FileImage, FileVideo, Info, XCircle,
} from 'lucide-react'
import { invalidateFileCache } from '@/lib/cache'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TrashedFile {
  id:           string
  originalName: string
  storedName:   string
  r2Key:        string
  fileType:     'PHOTO' | 'VIDEO'
  fileSize:     number
  status:       string
  event:        { id: string; name: string } | null
  subfolder:    { id: string; label: string } | null
}

interface TrashEntry {
  id:               string
  mediaFileId:      string
  deletedAt:        string
  scheduledPurgeAt: string
  preDeleteStatus:  string
  deletedBy:        { id: string; username: string | null; email: string }
  mediaFile:        TrashedFile
}

interface PageData {
  items: TrashEntry[]
  total: number
  page:  number
  limit: number
  pages: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function daysRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function hoursRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60)))
}

function urgencyClass(purgeAt: string) {
  const days = daysRemaining(purgeAt)
  if (days <= 3)  return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (days <= 10) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return                  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

function purgeLabel(purgeAt: string) {
  const days  = daysRemaining(purgeAt)
  const hours = hoursRemaining(purgeAt)
  if (days === 0 && hours === 0) return 'Purge imminent'
  if (days === 0)                return `${hours}h remaining`
  if (days === 1)                return '1 day remaining'
  return `${days} days remaining`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return                         `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminTrashPage() {
  const [data,         setData]         = useState<PageData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState('')
  const [restoring,    setRestoring]    = useState<string>('')   // trashItemId being restored
  const [purging,      setPurging]      = useState<string>('')   // trashItemId being purged
  const [page,         setPage]         = useState(1)
  const LIMIT = 50

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTrash = useCallback(async (pg = page) => {
    setLoading(true)
    setFetchError('')
    try {
      const res = await fetch(`/api/admin/trash?page=${pg}&limit=${LIMIT}`)
      const body = await res.json()
      if (!res.ok) {
        setFetchError(body?.error ?? `Server error ${res.status}`)
        return
      }
      setData(body as PageData)
    } catch (err) {
      setFetchError('Network error — could not load trash. Please refresh.')
      console.error('[AdminTrashPage] fetchTrash error:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchTrash(page) }, [page])

  // ── Restore ───────────────────────────────────────────────────────────────
  async function handleRestore(trashItemId: string, fileName: string) {
    if (!confirm(`Restore "${fileName}"? It will return to its previous status.`)) return

    setRestoring(trashItemId)
    try {
      const res = await fetch(`/api/admin/trash/${trashItemId}/restore`, { method: 'POST' })
      const body = await res.json()

      if (!res.ok) {
        alert(`Restore failed: ${body.error ?? 'Unknown error'}`)
        return
      }

      // Remove item from local state immediately for instant feedback
      setData(prev => prev
        ? {
            ...prev,
            items: prev.items.filter(i => i.id !== trashItemId),
            total: prev.total - 1,
          }
        : prev
      )
      // Bust SWR caches so FolderTree sidebar counts update immediately
      void invalidateFileCache()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setRestoring('')
    }
  }

  // ── Permanent purge ───────────────────────────────────────────────────────
  async function handlePurge(trashItemId: string, fileName: string) {
    if (!confirm(
      `Permanently delete "${fileName}"?\n\nThis will immediately remove the file from storage. This cannot be undone.`
    )) return

    setPurging(trashItemId)
    try {
      const res  = await fetch(`/api/admin/trash/${trashItemId}`, { method: 'DELETE' })
      const body = await res.json()

      if (!res.ok) {
        alert(`Purge failed: ${body.error ?? 'Unknown error'}`)
        return
      }

      setData(prev => prev
        ? {
            ...prev,
            items: prev.items.filter(i => i.id !== trashItemId),
            total: prev.total - 1,
          }
        : prev
      )
    } catch {
      alert('Network error — please try again.')
    } finally {
      setPurging('')
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600/20 border border-red-600/30 rounded-xl">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Trash</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Files are permanently purged 30 days after deletion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700
                             px-3 py-1.5 rounded-lg">
              {data.total} file{data.total !== 1 ? 's' : ''} in trash
            </span>
          )}
          <button
            onClick={() => fetchTrash(page)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Info banner ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20
                      rounded-2xl px-4 py-3 text-sm text-amber-300/80">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Only admins can view this page. Deleted files remain recoverable until their purge date.
          After purge, the R2 object is permanently destroyed — this action cannot be undone.
          Activity log entries are retained&nbsp;indefinitely regardless of file status.
        </span>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading trash…
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <XCircle className="w-10 h-10 text-red-500/60" />
          <p className="text-base font-medium text-red-400">Failed to load trash</p>
          <p className="text-sm text-slate-500 max-w-sm">{fetchError}</p>
          <button
            onClick={() => fetchTrash(page)}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-800
                       border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
          >
            Try again
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-600">
          <Trash2 className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-base font-medium">Trash is empty</p>
          <p className="text-sm mt-1">No files have been soft-deleted.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(entry => {
            const file        = entry.mediaFile
            const days        = daysRemaining(entry.scheduledPurgeAt)
            const isUrgent    = days <= 3
            const isRestoring = restoring === entry.id
            const isPurging   = purging   === entry.id
            const isBusy      = isRestoring || isPurging

            return (
              <div
                key={entry.id}
                className={`bg-slate-900/60 border rounded-2xl p-4 transition
                  ${isUrgent
                    ? 'border-red-800/40 shadow-sm shadow-red-950/30'
                    : 'border-slate-800/60'
                  }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* ── File info ───────────────────────────────────────────── */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0
                      ${file.fileType === 'VIDEO'
                        ? 'bg-violet-500/15 border border-violet-500/20'
                        : 'bg-sky-500/15 border border-sky-500/20'
                      }`}
                    >
                      {file.fileType === 'VIDEO'
                        ? <FileVideo  className="w-4 h-4 text-violet-400" />
                        : <FileImage  className="w-4 h-4 text-sky-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {file.originalName}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        {file.event && (
                          <span className="text-xs text-indigo-400">
                            {file.event.name}
                            {file.subfolder ? ` / ${file.subfolder.label}` : ''}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{formatSize(file.fileSize)}</span>
                        <span className="text-xs text-slate-600">
                          Was: <span className="text-slate-400">{entry.preDeleteStatus}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Right: badges + actions ──────────────────────────────── */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* Purge countdown badge */}
                    <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                                      text-xs font-medium border ${urgencyClass(entry.scheduledPurgeAt)}`}>
                      {isUrgent
                        ? <AlertTriangle className="w-3.5 h-3.5" />
                        : <Clock         className="w-3.5 h-3.5" />
                      }
                      {purgeLabel(entry.scheduledPurgeAt)}
                    </span>

                    {/* Restore button */}
                    <button
                      onClick={() => handleRestore(entry.id, file.originalName)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                 font-medium bg-emerald-600/20 text-emerald-300 border
                                 border-emerald-600/30 hover:bg-emerald-600/40 transition
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRestoring
                        ? <Loader2    className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw  className="w-3.5 h-3.5" />
                      }
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </button>

                    {/* Delete Permanently button */}
                    <button
                      onClick={() => handlePurge(entry.id, file.originalName)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                 font-medium bg-red-600/20 text-red-400 border
                                 border-red-600/30 hover:bg-red-600/40 transition
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPurging
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2  className="w-3.5 h-3.5" />
                      }
                      {isPurging ? 'Deleting…' : 'Delete Permanently'}
                    </button>
                  </div>
                </div>

                {/* ── Footer: deletion metadata ─────────────────────────────── */}
                <div className="mt-3 pt-3 border-t border-slate-800/60
                                flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>
                    Deleted by{' '}
                    <span className="text-slate-400">
                      {entry.deletedBy.username ?? entry.deletedBy.email}
                    </span>
                    {' '}on{' '}
                    <span className="text-slate-500">{formatDate(entry.deletedAt)}</span>
                  </span>
                  <span className={isUrgent ? 'text-red-500' : ''}>
                    Purge scheduled{' '}
                    <span className={isUrgent ? 'text-red-400 font-medium' : 'text-slate-500'}>
                      {formatDate(entry.scheduledPurgeAt)}
                    </span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                       border border-slate-700 hover:bg-slate-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">
            Page {data.page} of {data.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page === data.pages || loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                       border border-slate-700 hover:bg-slate-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Cron info for admin reference ────────────────────────────────────── */}
      <div className="flex items-start gap-2 text-xs text-slate-600 pt-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Automated purge runs daily via{' '}
          <code className="font-mono text-slate-500">GET /api/cron/purge</code>.
          Secure with the <code className="font-mono text-slate-500">CRON_SECRET</code> environment variable.
        </span>
      </div>
    </div>
  )
}
