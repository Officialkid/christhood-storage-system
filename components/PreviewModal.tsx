'use client'

/**
 * components/PreviewModal.tsx
 *
 * Full-screen lightbox with:
 *   - Left / right keyboard + button navigation through the file grid
 *   - Metadata panel: uploader, date, size, versions, event, tags
 *   - Role-gated action buttons: Download, Change Status, Archive, Share Link, Delete
 *   - Handles in-modal deletions gracefully (auto-advances to next file)
 */

import { useEffect, useRef, useState }           from 'react'
import { useSession }                            from 'next-auth/react'
import {
  X, Download, Film, Image as ImageIcon, Loader2,
  CalendarDays, User, HardDrive, GitBranch, Tag, Hash, Folder,
  ChevronLeft, ChevronRight, Trash2, Share2,
} from 'lucide-react'
import { StatusBadge }          from '@/components/StatusBadge'
import { StatusChangeDropdown } from '@/components/StatusChangeDropdown'
import { ArchiveButton }        from '@/components/ArchiveButton'
import { DeleteFileDialog }     from '@/components/DeleteFileDialog'
import ShareLinkDialog          from '@/components/ShareLinkDialog'
import type { MediaFile, AppRole, TagItem } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichedFile = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface PreviewData {
  url:          string
  thumbnailUrl: string | null
  file: {
    id:           string
    originalName: string
    fileType:     'PHOTO' | 'VIDEO'
    fileSize:     string
    status:       string
    createdAt:    string
    versionCount: number
    uploader:     { username: string | null; email: string }
  }
}

interface Props {
  /** The file to open (null = modal closed). */
  file:      EnrichedFile | null
  /** All files in the current grid — enables prev/next navigation. */
  allFiles:  EnrichedFile[]
  role:      AppRole
  onClose:   () => void
  onStatusChanged?: (fileId: string, newStatus: string) => void
  onDeleted?:       (fileId: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (n < 1024)       return `${n} B`
  if (n < 1024 ** 2)  return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)  return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreviewModal({ file, allFiles, role, onClose, onStatusChanged, onDeleted }: Props) {
  const { data: session }  = useSession()
  const userId             = session?.user?.id ?? ''

  // The currently-displayed file (may differ from `file` prop due to in-modal navigation)
  const [currentFile,   setCurrentFile]   = useState<EnrichedFile | null>(file)
  const [data,          setData]          = useState<PreviewData | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [localStatus,   setLocalStatus]   = useState<string>(file?.status ?? '')
  const [showDeleteDlg, setShowDeleteDlg] = useState(false)
  const [showShareDlg,  setShowShareDlg]  = useState(false)
  const [deletedIds,    setDeletedIds]    = useState<Set<string>>(new Set())

  const backdropRef  = useRef<HTMLDivElement>(null)
  const prevFileId   = useRef<string | null>(null)
  // Always-fresh navigate function for use in keyboard handler
  const navigateRef  = useRef<(dir: -1 | 1) => void>(() => {})

  // Sync currentFile when the `file` prop changes (new card clicked externally)
  useEffect(() => {
    setCurrentFile(file)
    setLocalStatus(file?.status ?? '')
  }, [file])

  // Fetch presigned URL whenever currentFile changes
  useEffect(() => {
    if (!currentFile) { setData(null); setError(null); return }
    if (currentFile.id === prevFileId.current) return
    prevFileId.current = currentFile.id

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`/api/preview/${currentFile.id}`)
      .then(res => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return res.json() })
      .then((json: PreviewData) => {
        if (!cancelled) {
          setData(json)
          setLocalStatus(json.file.status)
        }
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [currentFile])

  // Keep navigate ref up-to-date every render (avoids stale closures in keyboard handler)
  const visibleFiles = allFiles.filter(f => !deletedIds.has(f.id))
  const currentIdx   = currentFile ? visibleFiles.findIndex(f => f.id === currentFile.id) : -1
  const canGoPrev    = currentIdx > 0
  const canGoNext    = currentIdx < visibleFiles.length - 1

  navigateRef.current = (dir: -1 | 1) => {
    if (!currentFile) return
    const idx  = visibleFiles.findIndex(f => f.id === currentFile.id)
    const next = visibleFiles[idx + dir]
    if (next) {
      prevFileId.current = null // force re-fetch
      setCurrentFile(next)
      setLocalStatus(next.status)
    }
  }

  // Keyboard: Escape / ←→ navigation
  useEffect(() => {
    if (!currentFile) return
    function handleKey(e: KeyboardEvent) {
      if      (e.key === 'Escape')     onClose()
      else if (e.key === 'ArrowLeft')  navigateRef.current(-1)
      else if (e.key === 'ArrowRight') navigateRef.current(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentFile, onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = currentFile ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [currentFile])

  if (!currentFile) return null

  const isVideo = currentFile.fileType === 'VIDEO'

  const canDelete = (() => {
    if (role === 'UPLOADER') return false
    if (localStatus === 'DELETED' || localStatus === 'PURGED') return false
    if (role === 'ADMIN') return true
    if (localStatus === 'PUBLISHED') return false
    if (currentFile.uploaderId === userId) return true
    return localStatus === 'RAW'
  })()

  const canArchive      = role === 'ADMIN'
  const canChangeStatus = role === 'ADMIN' || role === 'EDITOR'

  function handleStatusChange(newStatus: string) {
    setLocalStatus(newStatus)
    onStatusChanged?.(currentFile!.id, newStatus)
  }

  function handleDeletedInModal(ids: string[]) {
    const deletedId = ids[0]
    setDeletedIds(prev => new Set([...prev, deletedId]))
    onDeleted?.(deletedId)
    setShowDeleteDlg(false)
    // Navigate to next or close
    const remaining = visibleFiles.filter(f => f.id !== deletedId)
    if (remaining.length === 0) {
      onClose()
    } else {
      const idx  = visibleFiles.findIndex(f => f.id === deletedId)
      const next = remaining[Math.min(idx, remaining.length - 1)]
      prevFileId.current = null
      setCurrentFile(next)
      setLocalStatus(next.status)
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/80 backdrop-blur-sm p-4 sm:p-6"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        className="relative flex flex-col lg:flex-row w-full max-w-6xl max-h-[90vh]
                   bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden
                   shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-label="File preview"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-xl bg-slate-800/80
                     border border-slate-700 text-slate-400 hover:text-white
                     hover:bg-slate-700 transition"
          aria-label="Close preview"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Media pane ─────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 bg-slate-950 flex items-center justify-center
                        relative overflow-hidden min-h-[280px] lg:min-h-[500px]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-sm text-red-400">Failed to load preview</p>
              <p className="text-xs text-slate-500">{error}</p>
            </div>
          )}

          {data && !isVideo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={data.url}
              src={data.url}
              alt={data.file.originalName}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: 'calc(90vh - 64px)' }}
            />
          )}

          {data && isVideo && (
            <video
              key={data.url}
              src={data.url}
              controls
              autoPlay={false}
              playsInline
              poster={data.thumbnailUrl ?? undefined}
              className="max-w-full max-h-full"
              style={{ maxHeight: 'calc(90vh - 64px)' }}
            >
              Your browser does not support the video tag.
            </video>
          )}

          {/* Prev / Next arrows */}
          {canGoPrev && (
            <button
              onClick={() => navigateRef.current(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full
                         bg-black/50 border border-white/10 text-white
                         hover:bg-black/70 transition z-10"
              aria-label="Previous file"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {canGoNext && (
            <button
              onClick={() => navigateRef.current(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full
                         bg-black/50 border border-white/10 text-white
                         hover:bg-black/70 transition z-10"
              aria-label="Next file"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* File counter */}
          {visibleFiles.length > 1 && currentIdx >= 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1
                            rounded-full bg-black/60 text-xs text-white/70 z-10">
              {currentIdx + 1} / {visibleFiles.length}
            </div>
          )}
        </div>

        {/* ── Metadata panel ──────────────────────────────────────────────────── */}
        <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0 border-t lg:border-t-0
                          lg:border-l border-slate-800 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* File name + type icon */}
            <div className="flex items-start gap-3 pr-8">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-800 border border-slate-700
                              flex items-center justify-center">
                {isVideo
                  ? <Film className="w-4 h-4 text-violet-400" />
                  : <ImageIcon className="w-4 h-4 text-indigo-400" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight break-all">
                  {currentFile.originalName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">
                  {currentFile.fileType}
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-500">Status</span>
              <div className="ml-auto">
                <StatusBadge status={localStatus} />
              </div>
            </div>

            {/* Metadata rows */}
            {data && (
              <dl className="space-y-3">
                <MetaRow icon={<User className="w-3.5 h-3.5" />} label="Uploaded by">
                  {data.file.uploader.username ?? data.file.uploader.email}
                </MetaRow>
                <MetaRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Upload date">
                  {fmtDate(data.file.createdAt)}
                </MetaRow>
                <MetaRow icon={<HardDrive className="w-3.5 h-3.5" />} label="File size">
                  {fmtSize(data.file.fileSize)}
                </MetaRow>
                <MetaRow icon={<GitBranch className="w-3.5 h-3.5" />} label="Versions">
                  {data.file.versionCount === 0
                    ? 'Original only'
                    : `${data.file.versionCount + 1} versions`}
                </MetaRow>
              </dl>
            )}

            {/* Event name */}
            {currentFile.event && (
              <MetaRow icon={<Folder className="w-3.5 h-3.5" />} label="Event">
                {currentFile.event.name}
              </MetaRow>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-3 animate-pulse">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-800 rounded w-3/4" />
                ))}
              </div>
            )}

            {/* Tags */}
            {currentFile.tags && currentFile.tags.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Hash className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider
                                   text-slate-500">Tags</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentFile.tags.map(t => (
                    <span
                      key={t.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs
                                 bg-slate-800 border border-slate-700 text-slate-300"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Action buttons ─────────────────────────────────────────────── */}
            <div className="pt-2 space-y-2 border-t border-slate-800">

              {/* Download — all roles */}
              {data && (
                <a
                  href={data.url}
                  download={currentFile.originalName}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                             bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
                             transition"
                >
                  <Download className="w-4 h-4" />
                  Download original
                </a>
              )}

              {/* Change status — Editor / Admin */}
              {canChangeStatus && data && (
                <StatusChangeDropdown
                  fileId={currentFile.id}
                  currentStatus={localStatus}
                  userRole={role}
                  onChanged={handleStatusChange}
                />
              )}

              {/* Archive — Admin only */}
              {canArchive && (
                <ArchiveButton
                  fileId={currentFile.id}
                  currentStatus={localStatus}
                  compact={false}
                  className="w-full"
                  onDone={(s) => {
                    setLocalStatus(s)
                    onStatusChanged?.(currentFile!.id, s)
                  }}
                />
              )}

              {/* Share link */}
              <button
                onClick={() => setShowShareDlg(true)}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
                           border border-slate-700 hover:border-slate-600 text-slate-300
                           hover:text-white text-sm font-medium transition"
              >
                <Share2 className="w-4 h-4" />
                Share link
              </button>

              {/* View detail page */}
              <a
                href={`/media/${currentFile.id}`}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
                           border border-slate-700 hover:border-slate-600 text-slate-300
                           hover:text-white text-sm font-medium transition"
              >
                View details &amp; versions
              </a>

              {/* Delete — Editor / Admin with permission */}
              {canDelete && (
                <button
                  onClick={() => setShowDeleteDlg(true)}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
                             border border-red-900/60 hover:border-red-800 text-red-400
                             hover:text-red-300 text-sm font-medium transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Move to trash
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Delete dialog */}
      {showDeleteDlg && (
        <DeleteFileDialog
          files={[{
            id:           currentFile.id,
            originalName: currentFile.originalName,
            status:       localStatus,
            uploaderId:   currentFile.uploaderId,
            thumbnailUrl: currentFile.thumbnailUrl,
          }]}
          userRole={role}
          currentUserId={userId}
          onClose={() => setShowDeleteDlg(false)}
          onDeleted={handleDeletedInModal}
        />
      )}

      {/* Share dialog */}
      {showShareDlg && (
        <ShareLinkDialog
          linkType="FILE"
          fileId={currentFile.id}
          defaultTitle={currentFile.originalName}
          onClose={() => setShowShareDlg(false)}
        />
      )}
    </div>
  )
}

// ── MetaRow helper ────────────────────────────────────────────────────────────

function MetaRow({
  icon, label, children,
}: {
  icon:     React.ReactNode
  label:    string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wider
                       text-slate-500 leading-none">
          {label}
        </dt>
        <dd className="text-sm text-slate-200 mt-0.5 break-words">{children}</dd>
      </div>
    </div>
  )
}

