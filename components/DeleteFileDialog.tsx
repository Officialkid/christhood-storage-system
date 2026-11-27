'use client'

import { useState }                 from 'react'
import { Trash2, X, AlertTriangle, Loader2, Image as ImageIcon, ShieldCheck } from 'lucide-react'
import type { AppRole }             from '@/types'
import { invalidateFileCache }      from '@/lib/cache'

export interface DeleteFileInfo {
  id:            string
  originalName:  string
  status:        string
  uploaderId:    string
  fileType?:     'PHOTO' | 'VIDEO'
  thumbnailUrl?: string | null
}

interface Props {
  /** One or more files to delete. Single-file when length === 1, batch otherwise. */
  files:          DeleteFileInfo[]
  userRole:       AppRole
  currentUserId:  string
  retentionDays?: number
  onClose:        () => void
  /** Called with the IDs of successfully deleted files. */
  onDeleted:      (deletedIds: string[]) => void
}

const BATCH_CHUNK_SIZE = 100

export function DeleteFileDialog({
  files, userRole: _userRole, currentUserId: _currentUserId, retentionDays = 13, onClose, onDeleted,
}: Props) {
  const [deleting,  setDeleting]  = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error,     setError]     = useState('')

  const isBatch          = files.length > 1
  const single           = !isBatch ? files[0] : null
  const pubCount         = files.filter(f => f.status === 'PUBLISHED').length
  const photoCount       = files.filter(f => f.fileType === 'PHOTO').length
  const videoCount       = files.filter(f => f.fileType === 'VIDEO').length
  const isAlreadyTrashed = !isBatch && single?.status === 'DELETED'
  const needsVerifyTick  = isBatch || pubCount > 0

  async function handleDelete() {
    if (needsVerifyTick && !confirmed) return
    setDeleting(true)
    setError('')
    try {
      if (isBatch) {
        const allIds = files.map(f => f.id)
        const deletedIds: string[] = []
        let firstFailureReason = ''

        for (let i = 0; i < allIds.length; i += BATCH_CHUNK_SIZE) {
          const chunk = allIds.slice(i, i + BATCH_CHUNK_SIZE)
          const res   = await fetch('/api/files/batch-delete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fileIds: chunk }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Failed to delete files')
          for (const d of (data.deleted ?? []) as { id: string }[]) {
            deletedIds.push(d.id)
          }
          if (!firstFailureReason && (data.failed ?? []).length > 0) {
            firstFailureReason = (data.failed[0] as { reason: string }).reason
          }
        }

        if (deletedIds.length === 0 && firstFailureReason) {
          throw new Error(firstFailureReason)
        }
        await invalidateFileCache()
        onDeleted(deletedIds)
      } else {
        const file = files[0]
        const res  = await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to delete file')
        await invalidateFileCache()
        onDeleted([file.id])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => !deleting && onClose()}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700/60
                   rounded-2xl shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-800">
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h2 className="text-base font-semibold text-white flex-1">
            {isBatch ? `Move ${files.length} files to Trash?` : 'Move this file to Trash?'}
          </h2>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── File identity ── */}
          {!isBatch && single ? (
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/40">
              {single.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={single.thumbnailUrl}
                  alt={single.originalName}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5 text-slate-500" />
                </div>
              )}
              <span className="text-sm text-slate-200 font-medium break-all line-clamp-2">
                {single.originalName}
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/40">
              <p className="text-sm text-white font-semibold">{files.length} files selected for deletion</p>
              <p className="text-xs text-slate-400 mt-1">
                {photoCount > 0 || videoCount > 0
                  ? `${photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? 's' : ''}` : ''}${photoCount > 0 && videoCount > 0 ? ' · ' : ''}${videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? 's' : ''}` : ''} — `
                  : ''}
                stored in Trash for {retentionDays} days before permanent removal.
              </p>
            </div>
          )}

          {/* ── Already-trashed warning ── */}
          {isAlreadyTrashed && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                This file is already in Trash. Visit Admin → Trash to restore or permanently delete it.
              </p>
            </div>
          )}

          {/* ── Published warning ── */}
          {pubCount > 0 && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                {isBatch
                  ? `${pubCount} of the selected files ${pubCount === 1 ? 'has' : 'have'} been published. Deleting published files may break external references.`
                  : 'This file has been published. Deleting it may break external references.'
                }
              </p>
            </div>
          )}

          {/* ── Impact disclosure ── */}
          <div className="space-y-2">
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                What happens next
              </p>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  {isBatch ? 'Selected files move' : 'File moves'} to Trash immediately and hide from events
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                  Recoverable from Admin → Trash for <strong>{retentionDays} days</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  After {retentionDays} days, {isBatch ? 'they are' : 'it is'} permanently purged from cloud storage
                </li>
              </ul>
            </div>
          </div>

          {/* ── Explicit verification checkbox for bulk / published deletes ── */}
          {needsVerifyTick && !isAlreadyTrashed && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/25 border border-red-500/25 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-slate-200 leading-relaxed flex-1">
                <strong className="text-white inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-red-400 inline" /> Verify deletion:
                </strong>{' '}
                I confirm moving {isBatch ? `these ${files.length} files` : 'this published file'} to Trash (auto-purged after {retentionDays} days).
              </span>
            </label>
          )}

          {/* ── Error ── */}
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-3 p-5 pt-0">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400
                       border border-slate-700 hover:bg-slate-800 transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || isAlreadyTrashed || (needsVerifyTick && !confirmed)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                       bg-red-600 hover:bg-red-500
                       disabled:opacity-40 disabled:cursor-not-allowed transition
                       flex items-center justify-center gap-2"
          >
            {deleting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : isAlreadyTrashed
                ? <span>Already in Trash</span>
                : <><Trash2 className="w-4 h-4" /><span>{isBatch ? `Delete ${files.length} Files` : 'Move to Trash'}</span></>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
