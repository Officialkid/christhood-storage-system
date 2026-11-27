'use client'

/**
 * components/MediaGrid.tsx
 *
 * Client wrapper that manages:
 *   - Preview modal (passes full file + allFiles for navigation)
 *   - Explicit "Select Files" mode + tap/click multi-select with sticky toolbar
 *   - Select All / Deselect All
 *   - Download selected
 *   - Batch status change (Editor / Admin)
 *   - Verified Batch delete (Editor / Admin) -> Trash (13 days)
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
  const [manualSelectMode, setManualSelectMode] = useState(false)
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set())
  const [showBatchDlg,     setShowBatchDlg]     = useState(false)
  const [deletedIds,       setDeletedIds]       = useState<Set<string>>(new Set())
  const [downloading,      setDownloading]      = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  const selectMode   = manualSelectMode || selectedIds.size > 0
  const visibleFiles = files.filter(f => !deletedIds.has(f.id))
  const allSelected  = visibleFiles.length > 0 && selectedIds.size === visibleFiles.length

  const handlePreview = useCallback((id: string) => {
    const f = visibleFiles.find(item => item.id === id)
    if (f) setPreviewFile(f)
  }, [visibleFiles])

  function toggleSelectId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setManualSelectMode(true)
    setSelectedIds(new Set(visibleFiles.map(f => f.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setManualSelectMode(false)
  }

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

  if (visibleFiles.length === 0) return null

  return (
    <>
      {/* ── Top Select / Bulk Action Bar ──────────────────────────────────── */}
      {!selectMode ? (
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs text-slate-400">
            {visibleFiles.length} file{visibleFiles.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualSelectMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                         bg-slate-800/80 text-slate-200 border border-slate-700
                         hover:bg-slate-800 hover:text-white transition min-h-[36px]"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              Select / Bulk Actions
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-20 flex items-center gap-2 flex-wrap
                        bg-slate-900/95 backdrop-blur border border-indigo-500/30
                        rounded-xl px-3.5 py-2.5 mb-4 shadow-lg">
          {/* Count */}
          <span className="text-sm font-semibold text-indigo-300 mr-1 shrink-0">
            {selectedIds.size} selected
            {skippedCount > 0 && (
              <span className="text-slate-500 font-normal ml-1 text-xs">
                ({skippedCount} protected)
              </span>
            )}
          </span>

          {/* Download */}
          {selectedIds.size > 0 && (
            <button
              onClick={downloadSelected}
              disabled={downloading}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-200
                         bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg
                         transition disabled:opacity-50 min-h-[36px]"
            >
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />
              }
              Download
            </button>
          )}

          {/* Change Status — Editor / Admin only */}
          {role !== 'UPLOADER' && selectedIds.size > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker(prev => !prev)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-200
                           bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg transition min-h-[36px]"
              >
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
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm
                                 text-slate-200 hover:bg-slate-700/60 text-left"
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bulk Delete — Editor / Admin with permission */}
          {deletableSelected.length > 0 && (
            <button
              onClick={() => setShowBatchDlg(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white
                         bg-red-600 hover:bg-red-500 px-3.5 py-2 rounded-lg transition min-h-[36px] shadow-sm shadow-red-900/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({deletableSelected.length})
            </button>
          )}

          {/* Select All / Deselect All */}
          <button
            onClick={allSelected ? () => setSelectedIds(new Set()) : selectAll}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300
                       hover:text-white px-3 py-2 rounded-lg border border-slate-700
                       hover:border-slate-500 transition ml-auto min-h-[36px]"
          >
            {allSelected
              ? <><Square className="w-3.5 h-3.5" /> Deselect All</>
              : <><CheckSquare className="w-3.5 h-3.5" /> Select All ({visibleFiles.length})</>
            }
          </button>

          {/* Exit select mode */}
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400
                       hover:text-white px-3 py-2 rounded-lg border border-slate-700
                       hover:border-slate-500 transition min-h-[36px]"
          >
            <X className="w-3.5 h-3.5" /> Done
          </button>
        </div>
      )}

      {/* ── File grid ────────────────────────────────────────────────────────  */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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

      {/* Verified Batch delete dialog */}
      {showBatchDlg && deletableSelected.length > 0 && (
        <DeleteFileDialog
          files={deletableSelected.map(f => ({
            id:           f.id,
            originalName: f.originalName,
            status:       f.status,
            uploaderId:   f.uploaderId,
            fileType:     f.fileType,
            thumbnailUrl: f.thumbnailUrl,
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
