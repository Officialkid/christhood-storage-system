'use client'

import { useState, useRef }  from 'react'
import Link                  from 'next/link'
import { useSession }        from 'next-auth/react'
import { Film, Image as ImageIcon, Play, Trash2, Check } from 'lucide-react'
import type { MediaFile, AppRole, TagItem } from '@/types'
import { DownloadButton }       from '@/components/DownloadButton'
import { StatusBadge }          from '@/components/StatusBadge'
import { StatusChangeDropdown } from '@/components/StatusChangeDropdown'
import { ArchiveButton }        from '@/components/ArchiveButton'
import { TagPill }              from '@/components/TagPill'
import { DeleteFileDialog }     from '@/components/DeleteFileDialog'

interface Props {
  media: MediaFile & {
    downloadUrl:  string
    thumbnailUrl: string | null
    tags?:        TagItem[]
  }
  /** Called with the file ID when the user clicks to preview. */
  onPreview?: (fileId: string) => void
  /** Called after a successful archive/un-archive so parent can refresh. */
  onStatusChanged?: (newStatus: string) => void
  /** Called after this card's file is deleted, so parent can remove it. */
  onDeleted?: (fileId: string) => void
  /** Whether the grid is in multi-select mode. */
  selectMode?: boolean
  /** Whether this card is currently selected. */
  selected?: boolean
  /** Callback to toggle this card's selection. */
  onToggleSelect?: (id: string) => void
}

export function MediaCard({
  media, onPreview, onStatusChanged, onDeleted,
  selectMode = false, selected = false, onToggleSelect,
}: Props) {
  const [hovered,       setHovered]       = useState(false)
  const [status,        setStatus]        = useState<string>(media.status)
  const [videoThumbErr, setVideoThumbErr] = useState(false)
  const [showDeleteDlg, setShowDeleteDlg] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const { data: session } = useSession()
  const role   = (session?.user?.role ?? 'UPLOADER') as AppRole
  const userId = session?.user?.id ?? ''

  // Compute UI-layer delete permission (mirrors server logic)
  const canDelete = (() => {
    if (role === 'UPLOADER') return false
    if (status === 'DELETED' || status === 'PURGED') return false
    if (role === 'ADMIN') return true
    if (status === 'PUBLISHED') return false
    if (media.uploaderId === userId) return true
    return status === 'RAW'
  })()

  const isVideo = media.fileType === 'VIDEO'
  const kb      = Math.round(Number(media.fileSize) / 1024)
  const size    = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`

  function handleVideoMeta() {
    const vid = videoRef.current
    if (vid) vid.currentTime = 0.001
  }

  // Body click: toggle selection in select mode, otherwise preview
  function handleBodyClick() {
    if (selectMode) {
      onToggleSelect?.(media.id)
    } else {
      onPreview?.(media.id)
    }
  }

  return (
    <>
      <div
        className={`relative rounded-xl overflow-hidden bg-slate-800 border aspect-square group cursor-pointer
                    transition-all duration-150
                    ${selected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                      : 'border-slate-700'
                    }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ── Thumbnail area ───────────────────────────────────────────────────── */}
        <div
          className="w-full h-full flex items-center justify-center bg-slate-700"
          onClick={handleBodyClick}
          title={selectMode ? (selected ? 'Deselect' : 'Select') : 'Click to preview'}
        >
        {media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbnailUrl}
            alt={media.originalName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : isVideo && !videoThumbErr ? (
          /* Video first-frame thumbnail — browser seeks to t=0.001 on metadata load */
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              src={media.downloadUrl}
              preload="metadata"
              muted
              playsInline
              className="w-full h-full object-cover"
              onLoadedMetadata={handleVideoMeta}
              onError={() => setVideoThumbErr(true)}
            />
            {/* Play icon overlay so it's clear this is a video */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          </div>
        ) : (
          /* Fallback icon when no thumbnail and video failed to load */
          <div className="flex flex-col items-center gap-2 text-slate-500">
            {isVideo
              ? <Film className="w-8 h-8 opacity-60" />
              : <ImageIcon className="w-8 h-8 opacity-60" />
            }
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">
              {isVideo ? 'Video' : 'Photo'}
            </span>
          </div>
        )}
      </div>

        {/* ── Selection checkbox — top-left (shown in select mode) ───────────────── */}
        {selectMode && (
          <div
            className="absolute top-2 left-2 z-10 cursor-pointer drop-shadow-md"
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(media.id) }}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                             ${selected
                               ? 'border-indigo-500 bg-indigo-600'
                               : 'border-white/70 bg-black/40'
                             }`}>
              {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
          </div>
        )}

        {/* ── Hover overlay — hidden in select mode ─────────────────────────── */}
        {!selectMode && (
          <div
            className={`absolute inset-0 bg-slate-900/80 flex flex-col justify-end p-3
                        transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}
          >
        <p className="text-xs text-white font-medium truncate">{media.originalName}</p>
        {media.event && (
          <p className="text-xs text-indigo-400 truncate mt-0.5">{media.event.name}</p>
        )}
        <p className="text-xs text-slate-400 mt-0.5">{size}</p>

        {/* Tag pills */}
        {media.tags && media.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {media.tags.slice(0, 3).map((t) => (
              <TagPill key={t.id} name={t.name} size="sm" />
            ))}
            {media.tags.length > 3 && (
              <span className="text-[10px] text-slate-500 leading-none self-center">
                +{media.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Preview button */}
        {onPreview && (
          <button
            onClick={() => onPreview(media.id)}
            className="mt-2 w-full flex items-center justify-center rounded-md
                       bg-indigo-600/80 px-2 py-1.5 text-xs font-medium text-white
                       hover:bg-indigo-500/90 transition-colors"
          >
            Preview
          </button>
        )}

        <DownloadButton
          fileId={media.id}
          fileName={media.originalName}
          className="mt-1 w-full"
        />

        {/* Detail page link */}
        <Link
          href={`/media/${media.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 flex w-full items-center justify-center rounded-md
                     bg-slate-600/70 px-2 py-1.5 text-xs font-medium text-slate-200
                     hover:bg-slate-500/70 transition-colors"
        >
          View details / versions
        </Link>

        {/* Status change — hidden for UPLOADERs */}
        <StatusChangeDropdown
          fileId={media.id}
          currentStatus={status}
          userRole={role}
          onChanged={(s) => setStatus(s)}
        />

            {/* Archive toggle — ADMIN only */}
            {role === 'ADMIN' && (
              <ArchiveButton
                fileId={media.id}
                currentStatus={status}
                compact={false}
                className="mt-1 w-full"
                onDone={(s) => {
                  setStatus(s)
                  onStatusChanged?.(s)
                }}
              />
            )}

            {/* Delete — EDITOR and ADMIN with permission */}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteDlg(true) }}
                className="mt-1 w-full flex items-center justify-center gap-1.5 rounded-md
                           bg-red-600/70 px-2 py-1.5 text-xs font-medium text-white
                           hover:bg-red-500/80 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Move to Trash
              </button>
            )}
          </div>
        )}

        {/* File-type badge — top-left (hidden in select mode) */}
        {!selectMode && (
          <span className="absolute top-2 left-2 rounded-md bg-slate-900/70 px-1.5 py-0.5
                           text-xs font-medium text-slate-300 pointer-events-none">
            {media.fileType}
          </span>
        )}

        {/* Status badge — top-right */}
        <div className="absolute top-2 right-2 pointer-events-none">
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Delete confirmation dialog */}
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
          onDeleted={(ids) => {
            setShowDeleteDlg(false)
            onDeleted?.(ids[0])
          }}
        />
      )}
    </>
  )
}
