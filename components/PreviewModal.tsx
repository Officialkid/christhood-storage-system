'use client'

/**
 * components/PreviewModal.tsx
 *
 * Lightbox / inline-video preview modal.
 * Fetches a short-lived presigned R2 URL from /api/preview/[fileId] and
 * displays the file without triggering a download log entry.
 *
 * Props:
 *   fileId   — the MediaFile ID to preview, or null to hide the modal
 *   onClose  — callback to clear the selected file in the parent
 */

import { useEffect, useRef, useState, KeyboardEvent as ReactKE } from 'react'
import {
  X, Download, Film, Image as ImageIcon, Loader2,
  CalendarDays, User, HardDrive, GitBranch, Tag,
} from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewFile {
  id:           string
  originalName: string
  fileType:     'PHOTO' | 'VIDEO'
  fileSize:     string   // stringified BigInt
  status:       string
  createdAt:    string
  versionCount: number
  uploader:     { username: string | null; email: string }
}

interface PreviewData {
  url:          string
  thumbnailUrl: string | null
  file:         PreviewFile
}

interface Props {
  fileId:  string | null
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (n < 1024)         return `${n} B`
  if (n < 1024 ** 2)    return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)    return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute:'2-digit',
  }).format(new Date(iso))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreviewModal({ fileId, onClose }: Props) {
  const [data,    setData]    = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const prevFileId            = useRef<string | null>(null)
  const backdropRef           = useRef<HTMLDivElement>(null)

  // ── Fetch presigned URL when fileId changes ────────────────────────────────
  useEffect(() => {
    if (!fileId) {
      setData(null)
      setError(null)
      return
    }
    if (fileId === prevFileId.current) return
    prevFileId.current = fileId

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`/api/preview/${fileId}`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((json: PreviewData) => {
        if (!cancelled) setData(json)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [fileId])

  // ── Escape key close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!fileId) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fileId, onClose])

  // ── Lock body scroll while modal is open ──────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = fileId ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fileId])

  if (!fileId) return null

  const isVideo = data?.file.fileType === 'VIDEO'

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      {/* Modal shell */}
      <div
        className="relative flex flex-col lg:flex-row w-full max-w-6xl max-h-[90vh]
                   bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden
                   shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-label="File preview"
      >
        {/* ── Close button ─────────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-slate-800/80
                     border border-slate-700 text-slate-400 hover:text-white
                     hover:bg-slate-700 transition"
          aria-label="Close preview"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Media viewer ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 bg-slate-950 flex items-center justify-center
                        relative overflow-hidden min-h-[280px] lg:min-h-[500px]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 text-slate-500 p-6 text-center">
              <p className="text-sm text-red-400">Failed to load preview</p>
              <p className="text-xs">{error}</p>
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
        </div>

        {/* ── Metadata panel ───────────────────────────────────────────────── */}
        <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0 border-t lg:border-t-0
                          lg:border-l border-slate-800 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* File name + type icon */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-800 border border-slate-700
                              flex items-center justify-center">
                {isVideo
                  ? <Film className="w-4 h-4 text-violet-400" />
                  : <ImageIcon className="w-4 h-4 text-indigo-400" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight break-all">
                  {data ? data.file.originalName : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {data ? data.file.fileType : ''}
                </p>
              </div>
            </div>

            {/* Status */}
            {data && (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-xs text-slate-500">Status</span>
                <div className="ml-auto">
                  <StatusBadge status={data.file.status} />
                </div>
              </div>
            )}

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
                  {data.file.versionCount === 0 ? 'Original only' : `${data.file.versionCount + 1} versions`}
                </MetaRow>
              </dl>
            )}

            {/* Loading skeleton for metadata */}
            {loading && (
              <div className="space-y-3 animate-pulse">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-800 rounded w-3/4" />
                ))}
              </div>
            )}

            {/* Action buttons */}
            {data && (
              <div className="pt-1 space-y-2">
                <a
                  href={data.url}
                  download={data.file.originalName}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                             bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
                             transition"
                >
                  <Download className="w-4 h-4" />
                  Download original
                </a>
                <a
                  href={`/media/${data.file.id}`}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
                             border border-slate-700 hover:border-slate-600 text-slate-300
                             hover:text-white text-sm font-medium transition"
                >
                  View details &amp; versions
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ── Small reusable metadata row ───────────────────────────────────────────────

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
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-none">
          {label}
        </dt>
        <dd className="text-sm text-slate-200 mt-0.5 break-words">{children}</dd>
      </div>
    </div>
  )
}
