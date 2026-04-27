'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession }                   from 'next-auth/react'
import {
  Check, MoreHorizontal, Download, Eye, Copy, Archive, ArchiveRestore,
  Trash2, History, Play, Film, Image as ImageIcon, ChevronRight, Share2,
} from 'lucide-react'
import type { MediaFile, AppRole, TagItem } from '@/types'
import { DeleteFileDialog } from '@/components/DeleteFileDialog'
import ShareLinkDialog      from '@/components/ShareLinkDialog'

type EnrichedFile = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  media:            EnrichedFile
  onPreview?:       (fileId: string) => void
  onStatusChanged?: (newStatus: string) => void
  onDeleted?:       (fileId: string) => void
  selectMode?:      boolean
  selected?:        boolean
  onToggleSelect?:  (id: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  RAW:                 'Raw',
  EDITING_IN_PROGRESS: 'Editing In Progress',
  EDITED:              'Edited',
  PUBLISHED:           'Published',
  ARCHIVED:            'Archived',
}

const WORKFLOW_STATUSES = [
  'RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED',
] as const

export function MediaCard({
  media, onPreview, onStatusChanged, onDeleted,
  selectMode = false, selected = false, onToggleSelect,
}: Props) {
  const { data: session } = useSession()
  const role   = (session?.user?.role ?? 'UPLOADER') as AppRole
  const userId = session?.user?.id ?? ''

  const [status,        setStatus]        = useState(media.status as string)
  const [hovered,       setHovered]       = useState(false)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [showStatusSub, setShowStatusSub] = useState(false)
  const [statusBusy,    setStatusBusy]    = useState(false)
  const [archiveBusy,   setArchiveBusy]   = useState(false)
  const [showDeleteDlg, setShowDeleteDlg] = useState(false)
  const [showShareDlg,  setShowShareDlg]  = useState(false)
  const [thumbLoadErr,  setThumbLoadErr]  = useState(false)
  const [videoThumbErr, setVideoThumbErr] = useState(false)
  const [videoDuration, setVideoDuration] = useState<string | null>(null)
  const [menuPos,       setMenuPos]       = useState<{ right: number; bottom: number } | null>(null)
  const [isMobileSheet, setIsMobileSheet] = useState(false)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dotsRef        = useRef<HTMLButtonElement>(null)
  const menuRef        = useRef<HTMLDivElement>(null)
  const videoRef       = useRef<HTMLVideoElement>(null)

  // Detect touch device on mount
  useEffect(() => {
    setIsMobileSheet(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  const isVideo = media.fileType === 'VIDEO'

  useEffect(() => {
    setThumbLoadErr(false)
    setVideoThumbErr(false)
  }, [media.id, media.thumbnailUrl])

  // ── Video duration detection ───────────────────────────────────────────────
  // Programmatic createElement is reliable on mobile; hidden DOM elements are
  // skipped by mobile browsers and never fire loadedmetadata.
  useEffect(() => {
    if (!isVideo || !media.downloadUrl) return
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted   = true
    const onMeta = () => {
      const d = v.duration
      if (Number.isFinite(d) && d > 0) setVideoDuration(formatVideoDuration(d))
      v.src = '' // release
    }
    const onErr = () => { v.src = '' }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('error', onErr)
    v.src = media.downloadUrl
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('error', onErr)
      v.src = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, media.downloadUrl])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Close menu on scroll (desktop)
  useEffect(() => {
    if (!menuOpen || isMobileSheet) return
    function handler() { closeMenu() }
    window.addEventListener('scroll', handler, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', handler, true)
  }, [menuOpen, isMobileSheet])

  function closeMenu() {
    setMenuOpen(false)
    setShowStatusSub(false)
  }

  function formatVideoDuration(s: number): string {
    if (!Number.isFinite(s) || s <= 0) return ''
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const canDelete = (() => {
    if (role === 'UPLOADER') return false
    if (status === 'DELETED' || status === 'PURGED') return false
    if (role === 'ADMIN') return true
    if (status === 'PUBLISHED') return false
    if (media.uploaderId === userId) return true
    return status === 'RAW'
  })()

  const canArchive      = role === 'ADMIN'
  const canChangeStatus = role === 'ADMIN' || role === 'EDITOR'

  const availableStatuses = (WORKFLOW_STATUSES as readonly string[]).filter(s => {
    if (s === status) return false
    if (role === 'UPLOADER') return false
    if (role === 'EDITOR' && (s === 'ARCHIVED' || status === 'ARCHIVED')) return false
    return true
  })

  // ── Event handlers ──────────────────────────────────────────────────────────

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      onToggleSelect?.(media.id)
    }, 500)
  }

  function handleTouchCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (selectMode) {
      onToggleSelect?.(media.id)
    } else {
      onPreview?.(media.id)
    }
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation()
    onToggleSelect?.(media.id)
  }

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!isMobileSheet) {
      const rect = dotsRef.current?.getBoundingClientRect()
      if (rect) {
        setMenuPos({
          right:  window.innerWidth  - rect.right,
          bottom: window.innerHeight - rect.top + 6,
        })
      }
    }
    setShowStatusSub(false)
    setMenuOpen(true)
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true)
    try {
      const res = await fetch(`/api/media/${media.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setStatus(newStatus)
        onStatusChanged?.(newStatus)
      }
    } finally {
      setStatusBusy(false)
      closeMenu()
    }
  }

  async function handleArchiveToggle() {
    const action = status === 'ARCHIVED' ? 'unarchive' : 'archive'
    setArchiveBusy(true)
    try {
      const res = await fetch('/api/admin/archive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileId: media.id, action }),
      })
      if (res.ok) {
        const json = await res.json()
        const newStatus = json.status as string
        setStatus(newStatus)
        onStatusChanged?.(newStatus)
      }
    } finally {
      setArchiveBusy(false)
      closeMenu()
    }
  }

  async function handleDownload() {
    closeMenu()
    try {
      const res = await fetch(`/api/download/${media.id}`)
      if (!res.ok) return
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href     = url
      a.download = media.originalName
      a.rel      = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch { /* silent — user can retry */ }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/media/${media.id}`).catch(() => {})
    closeMenu()
  }

  // ── Context menu content ─────────────────────────────────────────────────────

  const menuContent = (
    <div className="py-1 text-sm text-slate-200 select-none" style={{ minWidth: '210px' }}>
      <MenuItem icon={<Eye className="w-4 h-4" />}
        onClick={() => { closeMenu(); onPreview?.(media.id) }}>
        View details
      </MenuItem>

      <MenuItem icon={<Download className="w-4 h-4" />} onClick={handleDownload}>
        Download
      </MenuItem>

      {canChangeStatus && !showStatusSub && (
        <MenuItem
          icon={<span className="w-4 h-4 flex items-center justify-center text-[12px]">◎</span>}
          onClick={() => setShowStatusSub(true)}
          end={<ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        >
          Change status
        </MenuItem>
      )}

      {canChangeStatus && showStatusSub && (
        <div className="px-3 pt-2 pb-2 bg-slate-850">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5
                          flex items-center justify-between">
            Set status
            <button
              onClick={() => setShowStatusSub(false)}
              className="text-slate-500 hover:text-slate-300 text-[11px] normal-case tracking-normal"
            >
              ← back
            </button>
          </div>
          {availableStatuses.map(s => (
            <button
              key={s}
              disabled={statusBusy}
              onClick={() => handleStatusChange(s)}
              className="flex items-center w-full px-2 py-1.5 rounded-lg text-sm
                         text-slate-200 hover:bg-slate-700/60 text-left disabled:opacity-50"
            >
              {STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {canArchive && (
        <MenuItem
          icon={status === 'ARCHIVED'
            ? <ArchiveRestore className="w-4 h-4" />
            : <Archive className="w-4 h-4" />
          }
          disabled={archiveBusy}
          onClick={handleArchiveToggle}
        >
          {status === 'ARCHIVED' ? 'Unarchive' : 'Move to archive'}
        </MenuItem>
      )}

      <MenuItem
        icon={<Share2 className="w-4 h-4" />}
        onClick={() => { closeMenu(); setShowShareDlg(true) }}
      >
        Share link
      </MenuItem>

      {canDelete && (
        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          onClick={() => { closeMenu(); setShowDeleteDlg(true) }}
          danger
        >
          Delete
        </MenuItem>
      )}

      <div className="my-1 border-t border-slate-700/40" />

      <a
        href={`/media/${media.id}#versions`}
        onClick={closeMenu}
        className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-700/60
                   text-slate-200 hover:text-white transition-colors"
      >
        <History className="w-4 h-4 text-slate-400 shrink-0" />
        View version history
      </a>

      <MenuItem icon={<Copy className="w-4 h-4" />} onClick={handleCopyLink}>
        Copy file link
      </MenuItem>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <div
        className={`relative rounded-xl overflow-hidden bg-slate-800 aspect-square
                    cursor-pointer transition-shadow duration-150
                    ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchCancel}
        onTouchMove={handleTouchCancel}
        onClick={handleCardClick}
      >
        {/* Full-bleed thumbnail */}
        <div className="absolute inset-0">
          {media.thumbnailUrl && !thumbLoadErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.thumbnailUrl}
              alt={media.originalName}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setThumbLoadErr(true)}
            />
          ) : isVideo && !videoThumbErr ? (
            <video
              ref={videoRef}
              src={media.downloadUrl}
              preload="metadata"
              muted
              playsInline
              className="w-full h-full object-cover"
              onLoadedMetadata={() => {
                // Seek slightly so the first frame is visible as a poster
                if (videoRef.current) videoRef.current.currentTime = 0.001
              }}
              onError={() => setVideoThumbErr(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-700/60">
              {isVideo
                ? <Film className="w-10 h-10 text-slate-600" />
                : <ImageIcon className="w-10 h-10 text-slate-600" />
              }
            </div>
          )}
        </div>

        {/* Video play badge — bottom left, above gradient */}
        {isVideo && (
          <div className="absolute bottom-8 left-2 z-20 pointer-events-none">
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm
                            rounded-full px-2 py-0.5">
              <Play className="w-2.5 h-2.5 text-white fill-white" />
              <span className="text-[9px] text-white font-semibold tracking-wide">
                VIDEO{videoDuration ? ` · ${videoDuration}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Bottom gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 100%)' }}
        />

        {/* Filename (always visible) */}
        <p className="absolute bottom-0 left-0 right-0 px-2.5 pb-1.5 z-20 pointer-events-none
                      text-[11px] text-white/90 font-medium truncate leading-tight">
          {media.originalName}
        </p>

        {/* Hover dim overlay */}
        <div
          className={`absolute inset-0 bg-slate-900 transition-opacity duration-200 z-10
                      pointer-events-none
                      ${hovered || selectMode ? 'opacity-40' : 'opacity-0'}`}
        />

        {/* Checkbox — top left */}
        <div
          className={`absolute top-2 left-2 z-30 transition-opacity duration-150
                      ${hovered || selectMode || selected ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleCheckboxClick}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                           shadow-sm drop-shadow
                           ${selected
                             ? 'border-indigo-500 bg-indigo-600'
                             : 'border-white/80 bg-black/50 backdrop-blur-sm'
                           }`}
          >
            {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
        </div>

        {/* ⋯ button — bottom right */}
        <button
          ref={dotsRef}
          onClick={openMenu}
          className={`absolute bottom-1.5 right-1.5 z-30 p-1.5 rounded-lg
                      bg-black/60 text-white hover:bg-black/80
                      transition-opacity duration-150
                      ${hovered || menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label="File options"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* ── Desktop dropdown ─────────────────────────────────────────────────── */}
      {menuOpen && !isMobileSheet && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-[200] bg-slate-800 border border-slate-700/80 rounded-xl
                     shadow-2xl shadow-black/70 overflow-hidden"
          style={{ right: `${menuPos.right}px`, bottom: `${menuPos.bottom}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuContent}
        </div>
      )}

      {/* ── Mobile bottom sheet ──────────────────────────────────────────────── */}
      {menuOpen && isMobileSheet && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-end"
          onClick={closeMenu}
        >
          <div
            ref={menuRef}
            className="w-full bg-slate-800 border-t border-slate-700 rounded-t-2xl
                       shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>
            <div className="px-4 py-2.5 border-b border-slate-700/60">
              <p className="text-sm font-semibold text-white truncate">{media.originalName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{isVideo ? 'Video' : 'Photo'}</p>
            </div>
            {/* Prominent download CTA for mobile */}
            <div className="px-4 py-3 border-b border-slate-700/60">
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
                           text-white font-semibold text-sm transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
            {menuContent}
            <div className="px-4 pb-2 pt-1">
              <button
                onClick={closeMenu}
                className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-400 text-sm
                           hover:text-white hover:border-slate-500 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete dialog ────────────────────────────────────────────────────── */}
      {showDeleteDlg && (
        <DeleteFileDialog
          files={[{
            id:           media.id,
            originalName: media.originalName,
            status,
            uploaderId:   media.uploaderId,
            thumbnailUrl: media.thumbnailUrl,
          }]}
          userRole={role}
          currentUserId={userId}
          onClose={() => setShowDeleteDlg(false)}
          onDeleted={(ids) => { setShowDeleteDlg(false); onDeleted?.(ids[0]) }}
        />
      )}

      {/* ── Share link dialog ────────────────────────────────────────────────── */}
      {showShareDlg && (
        <ShareLinkDialog
          linkType="FILE"
          fileId={media.id}
          defaultTitle={media.originalName}
          onClose={() => setShowShareDlg(false)}
        />
      )}
    </>
  )
}

// ── MenuItem helper ───────────────────────────────────────────────────────────

function MenuItem({
  icon, children, onClick, end, danger = false, disabled = false,
}: {
  icon?:     React.ReactNode
  children:  React.ReactNode
  onClick?:  () => void
  end?:      React.ReactNode
  danger?:   boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 w-full px-4 py-2 text-left transition-colors
                  disabled:opacity-40
                  ${danger
                    ? 'text-red-400 hover:bg-red-900/40'
                    : 'text-slate-200 hover:bg-slate-700/60'
                  }`}
    >
      {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      <span className="flex-1">{children}</span>
      {end}
    </button>
  )
}

