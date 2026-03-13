'use client'

import { useState }                 from 'react'
import { Trash2, X, AlertTriangle, Loader2, Image as ImageIcon } from 'lucide-react'
import type { AppRole }             from '@/types'

export interface DeleteFileInfo {
  id:            string
  originalName:  string
  status:        string
  uploaderId:    string
  thumbnailUrl?: string | null
}

interface Props {
  /** One or more files to delete. Single-file when length === 1, batch otherwise. */
  files:         DeleteFileInfo[]
  userRole:      AppRole
  currentUserId: string
  onClose:       () => void
  /** Called with the IDs of successfully deleted files. */
  onDeleted:     (deletedIds: string[]) => void
}

export function DeleteFileDialog({
  files, userRole, currentUserId, onClose, onDeleted,
}: Props) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')

  const isBatch   = files.length > 1
  const single    = !isBatch ? files[0] : null
  const pubCount  = files.filter(f => f.status === 'PUBLISHED').length

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      if (isBatch) {
        const res  = await fetch('/api/files/batch-delete', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fileIds: files.map(f => f.id) }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to delete files')
        // Report IDs that were successfully deleted
        const deletedIds: string[] = (data.deleted ?? []).map((d: { id: string }) => d.id)
        if (deletedIds.length === 0 && (data.failed ?? []).length > 0) {
          throw new Error((data.failed[0] as { reason: string }).reason)
        }
        onDeleted(deletedIds)
      } else {
        const file = files[0]
        const res  = await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to delete file')
        onDeleted([file.id])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl
                      shadow-2xl shadow-black/60">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-800">
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h2 className="text-base font-semibold text-white flex-1">
            {isBatch ? `Delete ${files.length} files?` : 'Delete this file?'}
          </h2>
          <button
            onClick={onClose}
            disabled={deleting}
            className="text-slate-500 hover:text-white transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── File identity ── */}
          {!isBatch && single ? (
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl
                            border border-slate-700/40">
              {single.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={single.thumbnailUrl}
                  alt={single.originalName}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center
                                justify-center shrink-0">
                  <ImageIcon className="w-5 h-5 text-slate-500" />
                </div>
              )}
              <span className="text-sm text-slate-200 font-medium break-all line-clamp-2">
                {single.originalName}
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/40">
              <p className="text-sm text-slate-300 font-medium">{files.length} files selected</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All selected files will be moved to Trash.
              </p>
            </div>
          )}

          {/* ── Published warning ── */}
          {pubCount > 0 && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border
                            border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                {isBatch
                  ? `${pubCount} of the selected files ${pubCount === 1 ? 'has' : 'have'} been published.
                     Deleting published files may cause confusion for anyone relying on them externally.`
                  : 'This file has been published. Deleting it may cause confusion for anyone relying on it externally.'
                }
              </p>
            </div>
          )}

          {/* ── Impact disclosure ── */}
          <div className="space-y-2">
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                What will happen
              </p>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  {isBatch ? 'Files move' : 'File moves'} to Trash
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  {isBatch ? 'They will be' : 'It will be'} permanently deleted in 30 days
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">•</span>
                  All version history will also be trashed
                </li>
              </ul>
            </div>

            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                What will NOT happen
              </p>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                  Activity log records are NOT deleted
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                  You have 30 days to restore {isBatch ? 'them' : 'it'} from Trash
                </li>
              </ul>
            </div>
          </div>

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
                       border border-slate-700 hover:bg-slate-800 transition
                       disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                       bg-red-600 hover:bg-red-500
                       disabled:opacity-50 disabled:cursor-not-allowed transition
                       flex items-center justify-center gap-2"
          >
            {deleting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Trash2 className="w-4 h-4" /><span>Move to Trash</span></>
            }
          </button>
        </div>

      </div>
    </div>
  )
}
