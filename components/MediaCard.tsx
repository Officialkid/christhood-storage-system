'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Film, Image as ImageIcon } from 'lucide-react'
import type { MediaFile, AppRole, TagItem } from '@/types'
import { DownloadButton } from '@/components/DownloadButton'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusChangeDropdown } from '@/components/StatusChangeDropdown'
import { ArchiveButton } from '@/components/ArchiveButton'
import { TagPill } from '@/components/TagPill'

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
}

export function MediaCard({ media, onPreview, onStatusChanged }: Props) {
  const [hovered, setHovered]   = useState(false)
  const [status,  setStatus]    = useState<string>(media.status)
  const { data: session }       = useSession()
  const role                    = (session?.user?.role ?? 'UPLOADER') as AppRole

  const isVideo = media.fileType === 'VIDEO'
  const kb      = Math.round(Number(media.fileSize) / 1024)
  const size    = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-slate-800 border border-slate-700
                 aspect-square group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Thumbnail area ─────────────────────────────────────────────────── */}
      <div
        className="w-full h-full flex items-center justify-center bg-slate-700"
        onClick={() => onPreview?.(media.id)}
        title="Click to preview"
      >
        {media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbnailUrl}
            alt={media.originalName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          /* Fallback icon when thumbnail hasn't been generated yet */
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

      {/* ── Hover overlay ──────────────────────────────────────────────────── */}
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
      </div>

      {/* File-type badge — top left */}
      <span className="absolute top-2 left-2 rounded-md bg-slate-900/70 px-1.5 py-0.5
                       text-xs font-medium text-slate-300 pointer-events-none">
        {media.fileType}
      </span>

      {/* Status badge — top right */}
      <div className="absolute top-2 right-2 pointer-events-none">
        <StatusBadge status={status} />
      </div>
    </div>
  )
}
