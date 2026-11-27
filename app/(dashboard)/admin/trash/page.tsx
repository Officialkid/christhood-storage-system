'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Trash2, RotateCcw, Clock, AlertTriangle, Loader2,
  RefreshCw, ShieldAlert, FileImage, FileVideo, Info, XCircle,
  ArrowUpDown, CheckSquare, Square, X, ShieldCheck,
} from 'lucide-react'
import { TrashActionButton } from '@/components/admin/trash/TrashActionButton'
import {
  daysRemaining,
  urgencyClass,
  purgeLabel,
  formatTrashDate,
  formatTrashSize,
} from '@/components/admin/trash/trash-utils'
import { invalidateFileCache } from '@/lib/cache'
import { useToast } from '@/lib/toast'

interface TrashedFile {
  id:           string
  originalName: string
  storedName:   string
  r2Key?:       string
  fileType:     'PHOTO' | 'VIDEO'
  fileSize:     number | string
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
  mediaFile:        TrashedFile | null
}

interface PageData {
  items:          TrashEntry[]
  total:          number
  page:           number
  limit:          number
  pages:          number
  retentionDays?: number
}

interface ConfirmModalState {
  action: 'restore' | 'purge'
  ids:    string[]
  label:  string
}

export default function AdminTrashPage() {
  const toast = useToast()
  const [data,         setData]         = useState<PageData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState('')
  const [restoring,    setRestoring]    = useState<string>('')
  const [purging,      setPurging]      = useState<string>('')
  const [page,         setPage]         = useState(1)
  const [fileSort,     setFileSort]     = useState<'purge_asc' | 'purge_desc' | 'deleted_asc' | 'deleted_desc'>('purge_asc')
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [confirmState, setConfirmState] = useState<ConfirmModalState | null>(null)
  const [confirmTick,  setConfirmTick]  = useState(false)
  const [batchBusy,    setBatchBusy]    = useState(false)
  const LIMIT = 50

  const fetchTrash = useCallback(async (pg = page, sort = fileSort) => {
    setLoading(true)
    setFetchError('')
    try {
      const res  = await fetch(`/api/admin/trash?page=${pg}&limit=${LIMIT}&sort=${sort}`)
      const body = await res.json()
      if (!res.ok) {
        setFetchError(body?.error ?? `Server error ${res.status}`)
        return
      }
      setData(body as PageData)
      setSelectedIds(new Set())
    } catch {
      setFetchError('Network error — could not load trash. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [page, fileSort])

  useEffect(() => {
    fetchTrash(page, fileSort)
  }, [page, fileSort, fetchTrash])

  const validItems    = (data?.items ?? []).filter((i): i is TrashEntry & { mediaFile: TrashedFile } => !!i.mediaFile)
  const retentionDays = data?.retentionDays ?? 13
  const allSelected   = validItems.length > 0 && selectedIds.size === validItems.length

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openConfirm(action: 'restore' | 'purge', ids: string[], label: string) {
    setConfirmTick(false)
    setConfirmState({ action, ids, label })
  }

  async function executeConfirmedAction() {
    if (!confirmState) return
    const { action, ids } = confirmState
    if (action === 'purge' && !confirmTick) return

    setBatchBusy(true)
    if (ids.length === 1) {
      if (action === 'restore') setRestoring(ids[0])
      else setPurging(ids[0])
    }

    try {
      const res = await fetch('/api/admin/trash/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, trashItemIds: ids }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? `Failed to ${action} item(s).`)
        return
      }

      const succeeded: string[] = body.succeeded ?? []
      if (succeeded.length > 0) {
        const doneSet = new Set(succeeded)
        setData(prev => prev
          ? {
              ...prev,
              items: prev.items.filter(i => !doneSet.has(i.id)),
              total: Math.max(0, prev.total - succeeded.length),
            }
          : prev
        )
        setSelectedIds(prev => {
          const next = new Set(prev)
          for (const id of succeeded) next.delete(id)
          return next
        })
        if (action === 'restore') void invalidateFileCache()
        toast.success(
          action === 'restore'
            ? `Restored ${succeeded.length} file${succeeded.length !== 1 ? 's' : ''}.`
            : `Permanently deleted ${succeeded.length} file${succeeded.length !== 1 ? 's' : ''}.`
        )
      }
      if ((body.failed ?? []).length > 0) {
        toast.error(`${body.failed.length} file(s) failed to ${action}.`)
      }
      setConfirmState(null)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBatchBusy(false)
      setRestoring('')
      setPurging('')
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600/20 border border-red-600/30 rounded-xl">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Trash</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Deleted files stay here for {retentionDays} days before permanent removal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg">
              {data.total} file{data.total !== 1 ? 's' : ''} in trash
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={fileSort}
              onChange={e => { setFileSort(e.target.value as typeof fileSort); setPage(1) }}
              className="text-base sm:text-xs bg-slate-800 border border-slate-700 text-slate-300
                         rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1
                         focus:ring-indigo-500/60 cursor-pointer"
            >
              <option value="purge_asc">Purge date ↑</option>
              <option value="purge_desc">Purge date ↓</option>
              <option value="deleted_asc">Deleted date ↑</option>
              <option value="deleted_desc">Deleted date ↓</option>
            </select>
          </div>

          <button
            onClick={() => fetchTrash(page, fileSort)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25
                      rounded-2xl px-4 py-3 text-sm text-amber-200/90">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Deleted files remain recoverable for <strong>{retentionDays} days</strong>. After {retentionDays} days,
          they are permanently purged from cloud storage and cannot be undone.
        </span>
      </div>

      {/* ── Bulk Actions Bar ── */}
      {validItems.length > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 flex-wrap
                        bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedIds(allSelected ? new Set() : new Set(validItems.map(i => i.id)))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition min-h-[36px]"
            >
              {allSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />}
              {allSelected ? 'Deselect All' : `Select All (${validItems.length})`}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs font-semibold text-indigo-300">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openConfirm('restore', Array.from(selectedIds), `${selectedIds.size} selected file${selectedIds.size !== 1 ? 's' : ''}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-emerald-600 hover:bg-emerald-500 text-white transition min-h-[36px]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => openConfirm('purge', Array.from(selectedIds), `${selectedIds.size} selected file${selectedIds.size !== 1 ? 's' : ''}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-red-600 hover:bg-red-500 text-white transition min-h-[36px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Permanently ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Trash List ── */}
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
      ) : validItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Trash2 className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-base font-medium">Trash is empty</p>
          <p className="text-sm mt-1">No files are currently in Trash.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {validItems.map(entry => {
            const file        = entry.mediaFile
            const days        = daysRemaining(entry.scheduledPurgeAt)
            const isUrgent    = days <= 3
            const isRestoring = restoring === entry.id
            const isPurging   = purging   === entry.id
            const isBusy      = isRestoring || isPurging || batchBusy
            const isSelected  = selectedIds.has(entry.id)

            return (
              <div
                key={entry.id}
                className={`bg-slate-900/60 border rounded-2xl p-4 transition ${
                  isSelected
                    ? 'border-indigo-500/60 bg-indigo-950/20'
                    : isUrgent
                      ? 'border-red-800/40 shadow-sm shadow-red-950/30'
                      : 'border-slate-800/60'
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(entry.id)}
                      aria-label={`Select ${file.originalName}`}
                      className="mt-2.5 h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                    />
                    <div className={`p-2 rounded-xl shrink-0 ${
                      file.fileType === 'VIDEO'
                        ? 'bg-violet-500/15 border border-violet-500/20'
                        : 'bg-sky-500/15 border border-sky-500/20'
                    }`}>
                      {file.fileType === 'VIDEO'
                        ? <FileVideo className="w-4 h-4 text-violet-400" />
                        : <FileImage className="w-4 h-4 text-sky-400" />
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
                        <span className="text-xs text-slate-400">{formatTrashSize(Number(file.fileSize))}</span>
                        <span className="text-xs text-slate-500">
                          Was: <span className="text-slate-300">{entry.preDeleteStatus}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border ${urgencyClass(entry.scheduledPurgeAt)}`}>
                      {isUrgent ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {purgeLabel(entry.scheduledPurgeAt)}
                    </span>

                    <TrashActionButton
                      onClick={() => openConfirm('restore', [entry.id], `"${file.originalName}"`)}
                      disabled={isBusy}
                      busy={isRestoring}
                      idleLabel="Restore"
                      busyLabel="Restoring…"
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      tone="success"
                    />

                    <TrashActionButton
                      onClick={() => openConfirm('purge', [entry.id], `"${file.originalName}"`)}
                      disabled={isBusy}
                      busy={isPurging}
                      idleLabel="Delete Permanently"
                      busyLabel="Deleting…"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      tone="danger"
                    />
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    Deleted by{' '}
                    <span className="text-slate-300">
                      {entry.deletedBy.username ?? entry.deletedBy.email}
                    </span>{' '}
                    on <span className="text-slate-400">{formatTrashDate(entry.deletedAt)}</span>
                  </span>
                  <span className={isUrgent ? 'text-red-400' : ''}>
                    Auto-purge scheduled:{' '}
                    <span className={isUrgent ? 'text-red-300 font-medium' : 'text-slate-400'}>
                      {formatTrashDate(entry.scheduledPurgeAt)}
                    </span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                       border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition"
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
                       border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            Next →
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-slate-500 pt-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Automated purge runs daily via <code className="font-mono text-slate-400">GET /api/cron/purge</code> after the {retentionDays}-day retention window expires.
        </span>
      </div>

      {/* ── Styled Confirmation Modal ── */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !batchBusy && setConfirmState(null)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                {confirmState.action === 'restore'
                  ? `Restore ${confirmState.label}?`
                  : `Permanently delete ${confirmState.label}?`}
              </h2>
              <button
                onClick={() => setConfirmState(null)}
                disabled={batchBusy}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmState.action === 'restore' ? (
              <p className="text-sm text-slate-300">
                {confirmState.ids.length > 1 ? 'These files' : 'This file'} will be restored to {confirmState.ids.length > 1 ? 'their' : 'its'} original event folder and status.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  This will immediately destroy {confirmState.ids.length > 1 ? 'these files' : 'this file'} from Cloudflare R2 storage. <strong>This cannot be undone.</strong>
                </p>
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/30 border border-red-500/30 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmTick}
                    onChange={e => setConfirmTick(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs text-slate-200">
                    <strong className="text-white inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-red-400 inline" /> Verify permanent deletion:
                    </strong>{' '}
                    I understand {confirmState.label} cannot be recovered once purged.
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                disabled={batchBusy}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={batchBusy || (confirmState.action === 'purge' && !confirmTick)}
                onClick={executeConfirmedAction}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-40 ${
                  confirmState.action === 'restore'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {batchBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : confirmState.action === 'restore' ? (
                  <><RotateCcw className="w-4 h-4" /> Restore</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Delete Permanently</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
