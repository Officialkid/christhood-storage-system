'use client'

/**
 * components/MediaGrid.tsx
 *
 * Client wrapper that manages:
 *   - Preview modal (passes full file + allFiles for navigation)
 *   - Multi-select with sticky toolbar (all roles can select; actions are role-gated)
 *   - Select All / Deselect All
 *   - Download selected (sequential individual downloads)
 *   - Batch status change (Editor / Admin)
 *   - Batch delete (Editor / Admin)
 */

import { useState, useCallback }            from 'react'
import { useRouter }                         from 'next/navigation'
import { useSession }                        from 'next-auth/react'
import { Trash2, X, Download, CheckSquare, Square, Loader2, ChevronDown } from 'lucide-react'
import { MediaCard }        from '@/components/MediaCard'
import { PreviewModal }     from '@/components/PreviewModal'
import { DeleteFileDialog } from '@/components/DeleteFileDialog'
import type { MediaFile, AppRole, TagItem } from '@/types'

type EnrichedFile = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  files: EnrichedFile[]
}

const STATUS_OPTIONS = ['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED'] as const
const STATUS_LABELS: Record<string, string> = {
  RAW:                 'Raw',
  EDITING_IN_PROGRESS: 'Editing In Progress',
  EDITED:              'Edited',
  PUBLISHED:           'Published',
  ARCHIVED:            'Archived',
}

function canDeleteFile(
  role: AppRole,
  userId: string,
  file: { status: string; uploaderId: string },
): boolean {
  if (role === 'UPLOADER') return false
  if (file.status === 'DELETED' || file.status === 'PURGED') return false
  if (role === 'ADMIN') return true
  if (file.status === 'PUBLISHED') return false
  if (file.uploaderId === userId) return true
  return file.status === 'RAW'
}

export function MediaGrid({ files }: Props) {
  const router            = useRouter()
  const { data: session } = useSession()
  const role              = (session?.user?.role ?? 'UPLOADER') as AppRole
  const userId            = session?.user?.id ?? ''

  const [previewFile,      setPreviewFile]      = useState<EnrichedFile | null>(null)
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set())
  const [showBatchDlg,     setShowBatchDlg]     = useState(false)
  const [deletedIds,       setDeletedIds]       = useState<Set<string>>(new Set())
  const [downloading,      setDownloading]      = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  const selectMode   = selectedIds.size > 0
  const visibleFiles = files.filter(f => !deletedIds.has(f.id))
  const allSelected  = visibleFiles.length > 0 && selectedIds.size === visibleFiles.length

  const handlePreview = useCallback((id: string) => {
    const f = visibleFiles.find(f => f.id === id)
    if (f) setPreviewFile(f)
  }, [visibleFiles])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelectId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll()    { setSelectedIds(new Set(visibleFiles.map(f => f.id))) }
  function clearSelection() { setSelectedIds(new Set()) }

  function handleSingleDeleted(fileId: string) {
    setDeletedIds(prev => new Set([...prev, fileId]))
    if (previewFile?.id === fileId) setPreviewFile(null)
    router.refresh()
  }

  function handleModalDeleted(fileId: string) {
    setDeletedIds(prev => new Set([...prev, fileId]))
    router.refresh()
  }

  function handleBatchDeleted(ids: string[]) {
    setDeletedIds(prev => new Set([...prev, ...ids]))
    setShowBatchDlg(false)
    clearSelection()
    router.refresh()
  }

  async function downloadSelected() {
    if (downloading) return
    setDownloading(true)
    const selectedFiles = visibleFiles.filter(f => selectedIds.has(f.id))
    for (const file of selectedFiles) {
      try {
        const res = await fetch(`/api/download/${file.id}`)
        if (!res.ok) continue
        const { url } = await res.json()
        const a = document.createElement('a')
        a.href     = url
        a.download = file.originalName
        a.rel      = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        // Small delay between downloads to avoid browser blocking
        await new Promise(r => setTimeout(r, 400))
      } catch { /* skip failed files */ }
    }
    setDownloading(false)
  }

  async function batchChangeStatus(newStatus: string) {
    const targets = visibleFiles.filter(f => selectedIds.has(f.id))
    await Promise.allSettled(
      targets.map(f =>
        fetch(`/api/media/${f.id}/status`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: newStatus }),
        }),
      ),
    )
    setShowStatusPicker(false)
    router.refresh()
  }

  const deletableSelected = visibleFiles.filter(
    f => selectedIds.has(f.id) &&
         canDeleteFile(role, userId, { status: f.status, uploaderId: f.uploaderId }),
  )
  const skippedCount = selectedIds.size - deletableSelected.length

  return (
    <>
      {/* ── Selection toolbar (appears whenever ≥1 card is selected) ─────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-2 flex-wrap
                        bg-slate-900/95 backdrop-blur border border-indigo-500/30
                        rounded-xl px-4 py-2.5 mb-4 shadow-lg">

          {/* Count */}
          <span className="text-sm font-semibold text-indigo-300 mr-1 shrink-0">
            {selectedIds.size} selected
            {skippedCount > 0 && (
              <span className="text-slate-500 font-normal ml-1 text-xs">
                ({skippedCount} cannot be deleted)
              </span>
            )}
          </span>

          {/* Download */}
          <button
            onClick={downloadSelected}
            disabled={downloading}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-200
                       bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg
                       transition disabled:opacity-50"
          >
            {downloading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />
            }
            Download
          </button>

          {/* Change Status — Editor / Admin only */}
          {role !== 'UPLOADER' && (
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker(prev => !prev)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-200
                           bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition"
              >
                <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px]">◎</span>
                Status
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {showStatusPicker && (
                <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700
                                rounded-xl shadow-xl z-50 py-1 min-w-[190px]">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => batchChangeStatus(s)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm
                                 text-slate-200 hover:bg-slate-700/60 text-left"
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delete — Editor / Admin with permission */}
          {deletableSelected.length > 0 && (
            <button
              onClick={() => setShowBatchDlg(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white
                         bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {deletableSelected.length}
            </button>
          )}

          {/* Select All / Deselect All — pushed to the right */}
          <button
            onClick={allSelected ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400
                       hover:text-white px-3 py-1.5 rounded-lg border border-slate-700
                       hover:border-slate-500 transition ml-auto"
          >
            {allSelected
              ? <><Square className="w-3.5 h-3.5" /> Deselect All</>
              : <><CheckSquare className="w-3.5 h-3.5" /> Select All ({visibleFiles.length})</>
            }
          </button>

          {/* Clear */}
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400
                       hover:text-white px-3 py-1.5 rounded-lg border border-slate-700
                       hover:border-slate-500 transition"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* ── File grid ────────────────────────────────────────────────────────  */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {visibleFiles.map((m) => (
          <MediaCard
            key={m.id}
            media={m}
            onPreview={handlePreview}
            onDeleted={handleSingleDeleted}
            selectMode={selectMode}
            selected={selectedIds.has(m.id)}
            onToggleSelect={toggleSelectId}
          />
        ))}
      </div>

      {/* Preview modal */}
      <PreviewModal
        file={previewFile}
        allFiles={visibleFiles}
        role={role}
        onClose={() => setPreviewFile(null)}
        onDeleted={handleModalDeleted}
      />

      {/* Batch delete dialog */}
      {showBatchDlg && deletableSelected.length > 0 && (
        <DeleteFileDialog
          files={deletableSelected.map(f => ({
            id:           f.id,
            originalName: f.originalName,
            status:       f.status,
            uploaderId:   f.uploaderId,
          }))}
          userRole={role}
          currentUserId={userId}
          onClose={() => setShowBatchDlg(false)}
          onDeleted={handleBatchDeleted}
        />
      )}
    </>
  )
}


