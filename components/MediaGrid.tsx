'use client'

/**
 * components/MediaGrid.tsx
 *
 * Client wrapper that manages preview state, multi-select mode, and batch
 * delete for the media browser.
 */

import { useState, useCallback } from 'react'
import { useRouter }             from 'next/navigation'
import { useSession }            from 'next-auth/react'
import { Trash2, X }             from 'lucide-react'
import { MediaCard }             from '@/components/MediaCard'
import { PreviewModal }          from '@/components/PreviewModal'
import { DeleteFileDialog }      from '@/components/DeleteFileDialog'
import type { MediaFile, AppRole, TagItem } from '@/types'

type EnrichedFile = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  files: EnrichedFile[]
}

/** Mirrors the server-side permission check for delete. */
function canDeleteFile(role: AppRole, userId: string, file: { status: string; uploaderId: string }): boolean {
  if (role === 'UPLOADER') return false
  if (file.status === 'DELETED' || file.status === 'PURGED') return false
  if (role === 'ADMIN') return true
  if (file.status === 'PUBLISHED') return false
  if (file.uploaderId === userId) return true
  return file.status === 'RAW'
}

export function MediaGrid({ files }: Props) {
  const router             = useRouter()
  const { data: session }  = useSession()
  const role               = (session?.user?.role ?? 'UPLOADER') as AppRole
  const userId             = session?.user?.id ?? ''

  const [previewId,    setPreviewId]    = useState<string | null>(null)
  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [showBatchDlg, setShowBatchDlg] = useState(false)
  const [deletedIds,   setDeletedIds]   = useState<Set<string>>(new Set())

  const handlePreview      = useCallback((id: string) => setPreviewId(id), [])
  const handleClosePreview = useCallback(() => setPreviewId(null), [])

  function toggleSelectId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function handleSingleDeleted(fileId: string) {
    setDeletedIds(prev => new Set([...prev, fileId]))
    router.refresh()
  }

  function handleBatchDeleted(ids: string[]) {
    setDeletedIds(prev => new Set([...prev, ...ids]))
    setShowBatchDlg(false)
    exitSelectMode()
    router.refresh()
  }

  // Subset of selected files the current user is actually allowed to delete
  const deletableSelected = files.filter(
    f => selectedIds.has(f.id) && canDeleteFile(role, userId, { status: f.status, uploaderId: f.uploaderId }),
  )
  const skippedCount = selectedIds.size - deletableSelected.length

  // Hide locally-deleted files immediately without waiting for server re-render
  const visibleFiles = files.filter(f => !deletedIds.has(f.id))

  return (
    <>
      {/* ── Select-mode toolbar (EDITOR / ADMIN only) ─────────────────────── */}
      {role !== 'UPLOADER' && (
        <div className="flex items-center justify-end gap-2 mb-4 min-h-[34px]">
          {selectMode ? (
            <>
              {selectedIds.size > 0 && (
                <span className="text-xs text-slate-400 mr-1">
                  {selectedIds.size} selected
                  {skippedCount > 0 && (
                    <span className="text-slate-600 ml-1">
                      ({skippedCount} cannot be deleted)
                    </span>
                  )}
                </span>
              )}

              {deletableSelected.length > 0 && (
                <button
                  onClick={() => setShowBatchDlg(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white
                             bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete {deletableSelected.length} file{deletableSelected.length !== 1 ? 's' : ''}
                </button>
              )}

              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400
                           hover:text-white px-3 py-1.5 rounded-lg border border-slate-700
                           hover:border-slate-500 transition"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs font-medium text-slate-500 hover:text-slate-300
                         px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-600
                         transition"
            >
              Select
            </button>
          )}
        </div>
      )}

      {/* ── File grid ─────────────────────────────────────────────────────── */}
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

      <PreviewModal fileId={previewId} onClose={handleClosePreview} />

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

