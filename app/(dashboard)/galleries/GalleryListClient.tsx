'use client'

import { useState, useTransition } from 'react'
import { useRouter }               from 'next/navigation'
import Link                        from 'next/link'
import {
  GalleryHorizontal, Plus, Eye, Edit3, SendHorizonal, CheckCircle2,
  Archive, Share2, Image, Calendar, MoreHorizontal, X, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

type GalleryStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED'

interface GalleryItem {
  id:           string
  slug:         string
  title:        string
  description:  string | null
  categoryName: string | null
  year:         number
  status:       string
  coverUrl:     string | null
  totalPhotos:  number
  viewCount:    number
  createdAt:    string
  publishedAt:  string | null
  createdById:  string
  createdBy:    { id: string; name: string | null; username: string | null }
  publishedBy:  { id: string; name: string | null } | null
  fileCount:    number
}

interface Props {
  galleries: GalleryItem[]
  userRole:  'ADMIN' | 'EDITOR' | 'UPLOADER'
  userId:    string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  DRAFT:          { label: 'Draft',          classes: 'bg-slate-700/80  text-slate-300  ring-slate-600' },
  PENDING_REVIEW: { label: 'Pending Review', classes: 'bg-amber-950/80  text-amber-400  ring-amber-800' },
  PUBLISHED:      { label: 'Published',      classes: 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' },
  ARCHIVED:       { label: 'Archived',       classes: 'bg-violet-950/80 text-violet-400 ring-violet-800' },
}

function GalleryStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: 'bg-slate-700/80 text-slate-300 ring-slate-600' }
  return (
    <span className={`inline-flex items-center rounded-md text-[10px] px-1.5 py-0.5 font-semibold
                      tracking-wide ring-1 ring-inset select-none leading-none ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

// ─── New gallery modal ────────────────────────────────────────────────────────

function NewGalleryModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [title,    setTitle]    = useState('')
  const [year,     setYear]     = useState(new Date().getFullYear())
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/gallery/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: title.trim(), year }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create gallery'); return }
      router.push(`/galleries/${data.gallery.id}/edit`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">New Gallery</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Gallery Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Saturday Fellowship — March 2026"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5
                         text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Year</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              min={2000}
              max={2099}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5
                         text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1 flex items-center justify-center gap-2"
                  onClick={handleCreate} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Gallery'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Gallery card ─────────────────────────────────────────────────────────────

function GalleryCard({
  gallery, userRole, userId, onAction,
}: {
  gallery:   GalleryItem
  userRole:  Props['userRole']
  userId:    string
  onAction:  () => void
}) {
  const [pending, startTransition] = useTransition()
  const [busy,    setBusy]         = useState(false)
  const router = useRouter()

  const isOwner  = gallery.createdById === userId
  const isAdmin  = userRole === 'ADMIN'
  const isEditor = userRole === 'EDITOR'

  async function apiPatch(endpoint: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/${endpoint}`, { method: 'PATCH' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? `Action failed (${res.status})`)
        return
      }
      startTransition(() => { router.refresh(); onAction() })
    } finally { setBusy(false) }
  }

  const date = gallery.publishedAt
    ? `Published ${new Date(gallery.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `Created ${new Date(gallery.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden
                     flex flex-col transition-all hover:border-slate-700
                     ${busy || pending ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Cover */}
      <div className="relative aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
        {gallery.coverUrl ? (
          <img src={gallery.coverUrl} alt={gallery.title}
               className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <Image className="w-8 h-8" />
            <span className="text-xs">No cover set</span>
          </div>
        )}
        {/* Status badge overlay */}
        <div className="absolute top-2.5 left-2.5">
          <GalleryStatusBadge status={gallery.status} />
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 flex flex-col p-4 gap-3">
        <div>
          <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">
            {gallery.title}
          </h3>
          {gallery.categoryName && (
            <p className="text-xs text-slate-500 mt-0.5">{gallery.categoryName} · {gallery.year}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Image className="w-3 h-3" /> {gallery.totalPhotos} photo{gallery.totalPhotos !== 1 ? 's' : ''}
          </span>
          {gallery.status === 'PUBLISHED' && (
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> {gallery.viewCount.toLocaleString()} view{gallery.viewCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Calendar className="w-3 h-3" /> {date}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-auto pt-1">
          {/* ADMIN actions */}
          {isAdmin && gallery.status === 'PENDING_REVIEW' && (
            <Link href={`/galleries/${gallery.id}/review`}>
              <Button size="sm" variant="primary">Review</Button>
            </Link>
          )}
          {isAdmin && gallery.status === 'PENDING_REVIEW' && (
            <Button size="sm" variant="primary"
                    className="!bg-emerald-700 hover:!bg-emerald-600"
                    onClick={() => apiPatch('publish')}>
              Publish
            </Button>
          )}
          {isAdmin && gallery.status === 'PUBLISHED' && (
            <Button size="sm" variant="secondary" onClick={() => apiPatch('archive')}>
              Archive
            </Button>
          )}
          {isAdmin && (
            <Link href={`/galleries/${gallery.id}/edit`}>
              <Button size="sm" variant="ghost"><Edit3 className="w-3.5 h-3.5 mr-1" />Edit</Button>
            </Link>
          )}
          {isAdmin && gallery.status === 'PUBLISHED' && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://gallery.cmmschristhood.org/${gallery.slug}`)
                  .then(() => alert('Link copied!'))
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium
                         text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <Share2 className="w-3 h-3" /> Share
            </button>
          )}

          {/* EDITOR actions */}
          {isEditor && isOwner && (
            <Link href={`/galleries/${gallery.id}/edit`}>
              <Button size="sm" variant="ghost"><Edit3 className="w-3.5 h-3.5 mr-1" />Edit</Button>
            </Link>
          )}
          {isEditor && isOwner && gallery.status === 'DRAFT' && (
            <Button size="sm" variant="secondary" onClick={() => apiPatch('submit')}>
              <SendHorizonal className="w-3.5 h-3.5 mr-1" />Submit for Review
            </Button>
          )}
          {isEditor && !isOwner && gallery.status === 'PUBLISHED' && (
            <Link href={`/galleries/${gallery.id}/review`}>
              <Button size="sm" variant="ghost"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
            </Link>
          )}

          {/* UPLOADER actions */}
          {userRole === 'UPLOADER' && (
            <Link href={`/galleries/${gallery.id}/review`}>
              <Button size="sm" variant="ghost"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main list ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'ALL',            label: 'All'           },
  { id: 'DRAFT',          label: 'Draft'         },
  { id: 'PENDING_REVIEW', label: 'Pending Review' },
  { id: 'PUBLISHED',      label: 'Published'     },
  { id: 'ARCHIVED',       label: 'Archived'      },
]

export function GalleryListClient({ galleries, userRole, userId }: Props) {
  const [activeTab,    setActiveTab]    = useState('ALL')
  const [showNewModal, setShowNewModal] = useState(false)
  const [refresh,      setRefresh]      = useState(0)
  const router = useRouter()

  const canCreate = userRole === 'ADMIN' || userRole === 'EDITOR'

  const filtered = activeTab === 'ALL'
    ? galleries
    : galleries.filter(g => g.status === activeTab)

  // For uploaders, don't show tabs (they only see published)
  const showTabs = userRole !== 'UPLOADER'

  function handleAction() { setRefresh(r => r + 1); router.refresh() }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <GalleryHorizontal className="w-7 h-7 text-indigo-400" />
            Galleries
          </h1>
          <p className="mt-1 text-slate-400">
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
            {userRole === 'EDITOR' && ' · My galleries & published'}
            {userRole === 'UPLOADER' && ' · Published galleries'}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md"
                  className="flex items-center gap-2"
                  onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4" /> New Gallery
          </Button>
        )}
      </div>

      {/* Status tabs (admin + editor only) */}
      {showTabs && (
        <div className="flex flex-wrap gap-2">
          {TABS.map(tab => {
            const count = tab.id === 'ALL'
              ? galleries.length
              : galleries.filter(g => g.status === tab.id).length
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${activeTab === tab.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <GalleryHorizontal className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg font-medium text-slate-400">No galleries found</p>
          {canCreate && (
            <p className="mt-2 text-sm">
              <button onClick={() => setShowNewModal(true)}
                      className="text-indigo-400 hover:underline">Create your first gallery</button>
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(gallery => (
            <GalleryCard
              key={`${gallery.id}-${refresh}`}
              gallery={gallery}
              userRole={userRole}
              userId={userId}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* New gallery modal */}
      {showNewModal && <NewGalleryModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}
