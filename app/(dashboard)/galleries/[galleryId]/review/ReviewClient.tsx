'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link          from 'next/link'
import {
  ArrowLeft, Globe, Archive, Copy, Check, ExternalLink, Eye,
  EyeOff, Loader2, Calendar, Tag, Image as ImageIcon, Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ReviewFile {
  id:           string
  originalName: string
  thumbnailUrl: string
  previewUrl:   string
  isVisible:    boolean
}

interface ReviewSection {
  id:         string
  title:      string
  date:       string | null
  sortOrder:  number
  photoCount: number
  files:      ReviewFile[]
}

interface ReviewGallery {
  id:           string
  slug:         string
  title:        string
  description:  string | null
  categoryName: string | null
  year:         number
  status:       string
  coverUrl:     string | null
  allowDownload: boolean
  totalPhotos:  number
  viewCount:    number
  createdAt:    string
  publishedAt:  string | null
  createdBy:    { id: string; name: string | null; username: string | null }
  publishedBy:  { id: string; name: string | null } | null
  sections:     ReviewSection[]
}

export function ReviewClient({
  gallery: initial,
  isAdmin,
}: {
  gallery: ReviewGallery
  isAdmin: boolean
}) {
  const router = useRouter()
  const [gallery,    setGallery]    = useState(initial)
  const [publishing,   setPublishing]   = useState(false)
  const [archiving,    setArchiving]     = useState(false)
  const [published,    setPublished]     = useState(false)
  const [copied,       setCopied]        = useState(false)
  const [showConfirm,  setShowConfirm]   = useState(false)
  const [supportsShare, setSupportsShare] = useState(false)

  const publicUrl = `https://gallery.cmmschristhood.org/${gallery.slug}`

  useEffect(() => { setSupportsShare(!!navigator.share) }, [])

  async function publishGallery() {
    setPublishing(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/publish`, { method: 'PATCH' })
      if (res.ok) {
        setGallery(g => ({ ...g, status: 'PUBLISHED' }))
        setPublished(true)
        setShowConfirm(false)
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to publish gallery')
      }
    } finally { setPublishing(false) }
  }

  async function archiveGallery() {
    if (!confirm('Archive this gallery? It will no longer be publicly visible.')) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/archive`, { method: 'PATCH' })
      if (res.ok) { router.push('/galleries') }
      else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to archive gallery')
      }
    } finally { setArchiving(false) }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShare() {
    const shareData = {
      title: gallery.title,
      text:  `Check out these photos from Christhood: ${gallery.title}`,
      url:   publicUrl,
    }
    try {
      await navigator.share(shareData)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await navigator.clipboard.writeText(publicUrl).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  const isPublished     = gallery.status === 'PUBLISHED'
  const isPendingReview = gallery.status === 'PENDING_REVIEW'

  return (
    <div className="flex flex-col min-h-screen -mx-4 sm:-mx-8 -mt-6 sm:-mt-8">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3
                      bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/70">
        <Link href="/galleries"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white
                         transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Galleries
        </Link>
        <span className="text-slate-700">/</span>
        <p className="text-sm text-slate-200 font-medium truncate flex-1">{gallery.title}</p>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset
          ${gallery.status === 'PENDING_REVIEW' ? 'bg-amber-950/80 text-amber-400 ring-amber-800' : ''}
          ${gallery.status === 'PUBLISHED'      ? 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' : ''}
          ${gallery.status === 'DRAFT'          ? 'bg-slate-700/80 text-slate-300 ring-slate-600' : ''}
          ${gallery.status === 'ARCHIVED'       ? 'bg-violet-950/80 text-violet-400 ring-violet-800' : ''}
        `}>
          {gallery.status === 'PENDING_REVIEW' ? 'Pending Review' : gallery.status}
        </span>
      </div>

      {/* ── Published success banner ─────────────────────────────────────── */}
      {published && (
        <div className="mx-4 sm:mx-6 mt-4 bg-emerald-950/50 border border-emerald-800/50
                        rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">Gallery published successfully!</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded-lg truncate max-w-xs">
              {publicUrl}
            </code>
            <button onClick={copyLink}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {supportsShare && (
              <button
                onClick={handleShare}
                className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5
                           rounded-lg transition-colors whitespace-nowrap"
              >
                Share ↗
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 flex-1">
        {/* LEFT: metadata card */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">
          {/* Cover */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="aspect-video bg-slate-800 flex items-center justify-center">
              {gallery.coverUrl ? (
                <img src={gallery.coverUrl} alt="Cover"
                     className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-xs">No cover</span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <MetaRow icon={<Tag className="w-4 h-4" />}        label="Category"    value={gallery.categoryName ?? '—'} />
            <MetaRow icon={<Calendar className="w-4 h-4" />}   label="Year"        value={String(gallery.year)} />
            <MetaRow icon={<ImageIcon className="w-4 h-4" />}  label="Photos"      value={String(gallery.totalPhotos)} />
            <MetaRow icon={<Eye className="w-4 h-4" />}        label="Views"       value={String(gallery.viewCount)} />
            <MetaRow icon={<Globe className="w-4 h-4" />}      label="Slug"        value={gallery.slug} mono />
            {gallery.description && (
              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-400">{gallery.description}</p>
              </div>
            )}
          </div>

          {/* Attribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-500">
            <div>
              Created by{' '}
              <span className="text-slate-300">
                {gallery.createdBy.name ?? gallery.createdBy.username ?? 'Unknown'}
              </span>
              {' '}on {new Date(gallery.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
            {gallery.publishedAt && gallery.publishedBy && (
              <div>
                Published by{' '}
                <span className="text-slate-300">{gallery.publishedBy.name}</span>
                {' '}on {new Date(gallery.publishedAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </div>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="space-y-2">
              {(isPendingReview || gallery.status === 'DRAFT') && (
                <Button variant="primary" size="md" onClick={() => setShowConfirm(true)}
                        className="w-full flex items-center justify-center gap-2
                                   !bg-emerald-700 hover:!bg-emerald-600">
                  <Globe className="w-4 h-4" />
                  Publish Gallery
                </Button>
              )}
              {isPublished && (
                <Button variant="danger" size="md" onClick={archiveGallery} disabled={archiving}
                        className="w-full flex items-center justify-center gap-2">
                  {archiving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Archiving…</>
                    : <><Archive className="w-4 h-4" /> Archive Gallery</>}
                </Button>
              )}
              {isPublished && (
                <div className="flex gap-2 flex-wrap">
                  {supportsShare && (
                    <button onClick={handleShare}
                            className="flex-1 flex items-center justify-center gap-2 py-2
                                       bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300
                                       hover:text-white transition-colors">
                      <Share2 className="w-4 h-4" />
                      Share ↗
                    </button>
                  )}
                  <button onClick={copyLink}
                          className="flex-1 flex items-center justify-center gap-2 py-2
                                     bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300
                                     hover:text-white transition-colors">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer"
                     className="flex-1 flex items-center justify-center gap-2 py-2
                                bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300
                                hover:text-white transition-colors">
                    <ExternalLink className="w-4 h-4" />
                    View Live
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: photo preview */}
        <div className="flex-1 min-w-0 space-y-6">
          <h2 className="text-sm font-semibold text-slate-300">
            Gallery Preview
            <span className="text-slate-500 font-normal ml-2">— read-only</span>
          </h2>

          {gallery.sections.length === 0 ? (
            <div className="border border-dashed border-slate-700 rounded-2xl py-16 text-center">
              <ImageIcon className="w-8 h-8 mx-auto text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No photos in this gallery</p>
            </div>
          ) : (
            gallery.sections.map(section => (
              <div key={section.id}
                   className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{section.title}</span>
                  {section.date && (
                    <span className="text-xs text-slate-500">
                      {new Date(section.date).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </span>
                  )}
                  <span className="text-xs text-slate-600 ml-auto">
                    {section.files.length} photo{section.files.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {section.files.map(file => (
                    <div key={file.id}
                         className={`relative aspect-square rounded-xl overflow-hidden bg-slate-800
                           ${!file.isVisible ? 'opacity-40' : ''}`}>
                      <img src={file.thumbnailUrl} alt={file.originalName}
                           className="w-full h-full object-cover" loading="lazy" />
                      {!file.isVisible && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <EyeOff className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Publish confirm dialog ───────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-5">
            <h3 className="text-base font-semibold text-white">Publish Gallery?</h3>
            <div className="space-y-2 text-sm text-slate-400">
              <p><span className="text-slate-200 font-medium">Title:</span> {gallery.title}</p>
              <p><span className="text-slate-200 font-medium">Photos:</span> {gallery.totalPhotos}</p>
              <p>
                <span className="text-slate-200 font-medium">Public URL:</span>{' '}
                <span className="text-indigo-400 font-mono text-xs break-all">{publicUrl}</span>
              </p>
            </div>
            <p className="text-xs text-amber-400">
              This gallery will immediately be visible to the public.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={publishGallery} disabled={publishing}
                      className="flex items-center gap-1.5 !bg-emerald-700 hover:!bg-emerald-600">
                {publishing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
                  : 'Yes, Publish Now'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({
  icon, label, value, mono = false,
}: {
  icon:   React.ReactNode
  label:  string
  value:  string
  mono?:  boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 w-4 shrink-0">{icon}</span>
      <span className="text-slate-500 w-20 shrink-0 text-xs">{label}</span>
      <span className={`text-slate-200 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
