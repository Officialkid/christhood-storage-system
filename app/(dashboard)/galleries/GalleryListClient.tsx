'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter }               from 'next/navigation'
import Link                        from 'next/link'
import {
  GalleryHorizontal, Plus, Eye, Edit3, SendHorizonal, CheckCircle2,
  Archive, Share2, Image, Calendar, MoreHorizontal, X, Loader2, Copy, Check,
  Trash2, Pencil, Globe,
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

const STATUS_CONFIG: Record<string, { label: string; classes: string; pulse?: boolean; hint?: string }> = {
  DRAFT:          { label: 'Draft',          classes: 'bg-slate-700/80  text-slate-300  ring-slate-600', hint: 'Needs review before publishing' },
  PENDING_REVIEW: { label: 'Pending Review', classes: 'bg-amber-950/80  text-amber-400  ring-amber-800', pulse: true, hint: 'Ready to publish' },
  PUBLISHED:      { label: 'Published',      classes: 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' },
  ARCHIVED:       { label: 'Archived',       classes: 'bg-violet-950/80 text-violet-400 ring-violet-800', hint: 'Not publicly visible' },
}

function GalleryStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: 'bg-slate-700/80 text-slate-300 ring-slate-600' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md text-[10px] px-1.5 py-0.5 font-semibold
                      tracking-wide ring-1 ring-inset select-none leading-none ${cfg.classes}`}>
      {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
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

// ─── Gallery card three-dot menu ─────────────────────────────────────────────

function GalleryKebabMenu({
  gallery,
  userRole,
  userId,
  onApiAction,
  onRename,
  onDelete,
  onCopied,
}: {
  gallery:     GalleryItem
  userRole:    Props['userRole']
  userId:      string
  onApiAction: (endpoint: string) => void
  onRename:    () => void
  onDelete:    () => void
  onCopied:    () => void
}) {
  const [open,          setOpen]          = useState(false)
  const [supportsShare, setSupportsShare] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router  = useRouter()

  const galleryPublicUrl = `https://gallery.cmmschristhood.org/${gallery.slug}`
  const isAdmin  = userRole === 'ADMIN'
  const isEditor = userRole === 'EDITOR'
  const isOwner  = gallery.createdById === userId

  useEffect(() => { setSupportsShare(!!navigator.share) }, [])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  async function handleShare() {
    setOpen(false)
    try {
      await navigator.share({
        title: gallery.title,
        text:  `Check out these photos from Christhood: ${gallery.title}`,
        url:   galleryPublicUrl,
      })
    } catch { /* user cancelled */ }
  }

  async function handleCopyLink() {
    setOpen(false)
    await navigator.clipboard.writeText(galleryPublicUrl).catch(() => {})
    onCopied()
  }

  function MenuItem({
    icon, label, onClick, danger = false,
  }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(false); onClick() }}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors
          ${danger
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
          }`}
      >
        <span className="w-4 shrink-0 flex items-center justify-center">{icon}</span>
        {label}
      </button>
    )
  }

  const canPublish = isAdmin && gallery.status === 'PENDING_REVIEW'
  const canArchive = isAdmin && gallery.status === 'PUBLISHED'
  const canSubmit  = isEditor && isOwner && gallery.status === 'DRAFT'
  const canShare   = gallery.status === 'PUBLISHED'
  const canDelete  = isAdmin || (isEditor && isOwner && gallery.status === 'DRAFT')

  if (userRole === 'UPLOADER') return null
  if (isEditor && !isOwner)    return null

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger ⋮ */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-lg bg-black/40 hover:bg-black/70 text-white transition-colors backdrop-blur-sm"
        title="Gallery options"
        aria-label="Gallery options"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
          />

          {/* Menu panel: bottom sheet (mobile) / dropdown (desktop) */}
          <div className={`
            fixed bottom-0 left-0 right-0 z-50
            sm:absolute sm:bottom-auto sm:left-auto sm:top-full sm:right-0 sm:w-52
            bg-slate-900 border border-slate-700
            rounded-t-2xl sm:rounded-xl
            shadow-2xl py-1.5
          `}>
            {/* Bottom sheet handle (mobile only) */}
            <div className="sm:hidden flex justify-center pt-2 pb-0.5">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>
            <p className="sm:hidden text-xs text-slate-500 px-4 pt-2 pb-1 truncate">
              {gallery.title}
            </p>

            <MenuItem
              icon={<Edit3 className="w-3.5 h-3.5" />}
              label="Edit"
              onClick={() => router.push(`/galleries/${gallery.id}/edit`)}
            />
            <MenuItem
              icon={<Pencil className="w-3.5 h-3.5" />}
              label="Rename"
              onClick={onRename}
            />
            {canPublish && (
              <MenuItem
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                label="Publish"
                onClick={() => onApiAction('publish')}
              />
            )}
            {canArchive && (
              <MenuItem
                icon={<Archive className="w-3.5 h-3.5 text-violet-400" />}
                label="Archive"
                onClick={() => onApiAction('archive')}
              />
            )}
            {canSubmit && (
              <MenuItem
                icon={<SendHorizonal className="w-3.5 h-3.5" />}
                label="Submit for Review"
                onClick={() => onApiAction('submit')}
              />
            )}
            {canShare && (
              supportsShare
                ? <MenuItem icon={<Share2 className="w-3.5 h-3.5" />} label="Share ↗" onClick={handleShare} />
                : <MenuItem icon={<Copy   className="w-3.5 h-3.5" />} label="Copy link" onClick={handleCopyLink} />
            )}

            {canDelete && (
              <>
                <div className="mx-2 my-1 border-t border-slate-700/70" />
                <MenuItem
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  label={isAdmin ? 'Delete' : 'Delete draft'}
                  onClick={onDelete}
                  danger
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Rename dialog ────────────────────────────────────────────────────────────

function RenameDialog({
  galleryId,
  currentTitle,
  onClose,
  onSaved,
}: {
  galleryId:    string
  currentTitle: string
  onClose:      () => void
  onSaved:      (newTitle: string) => void
}) {
  const [title,  setTitle]  = useState(currentTitle)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) { setError('Title cannot be empty'); return }
    if (trimmed === currentTitle) { onClose(); return }
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch(`/api/gallery/${galleryId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to rename'); return }
      onSaved(data.gallery.title)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Rename gallery</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          value={title}
          autoFocus
          maxLength={200}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5
                     text-sm text-white focus:outline-none focus:border-indigo-500"
        />
        {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary" size="sm"
            className="flex-1 flex items-center justify-center gap-1.5"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  gallery,
  isAdmin,
  onClose,
  onDeleted,
}: {
  gallery:   GalleryItem
  isAdmin:   boolean
  onClose:   () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to delete gallery')
        return
      }
      onDeleted()
    } catch {
      setError('Network error — please try again')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-500/10 shrink-0 mt-0.5">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Delete &ldquo;{gallery.title}&rdquo;?
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isAdmin
                ? 'This will move the gallery and all its photos to the trash. They will be permanently deleted after 30 days.'
                : 'This will permanently delete this draft gallery and all its uploaded photos.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger" size="sm"
            className="flex-1 flex items-center justify-center gap-1.5"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
              : 'Move to Trash'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Publish confirm dialog ─────────────────────────────────────────────────────

function PublishConfirmDialog({
  gallery,
  onClose,
  onConfirm,
  publishing,
}: {
  gallery:    GalleryItem
  onClose:    () => void
  onConfirm:  () => void
  publishing: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!publishing ? onClose : undefined} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Publish this gallery?</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              &ldquo;{gallery.title}&rdquo; &middot; {gallery.totalPhotos} photo{gallery.totalPhotos !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Anyone with the link can view it after publishing.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={publishing}>
            Cancel
          </Button>
          <Button
            variant="primary" size="sm"
            className="flex-1 flex items-center justify-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-500"
            onClick={onConfirm}
            disabled={publishing}
          >
            {publishing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing&hellip;</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Publish</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Gallery card ─────────────────────────────────────────────────────────────

function GalleryCard({
  gallery: initialGallery, userRole, userId, onAction,
}: {
  gallery:   GalleryItem
  userRole:  Props['userRole']
  userId:    string
  onAction:  () => void
}) {
  const [gallery,           setGallery]           = useState(initialGallery)
  const [pending,           startTransition]      = useTransition()
  const [busy,              setBusy]              = useState(false)
  const [showRename,        setShowRename]        = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copiedLink,        setCopiedLink]        = useState(false)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [publishing,        setPublishing]        = useState(false)
  const [publishedUrl,      setPublishedUrl]      = useState<string | null>(null)
  const router = useRouter()

  const isAdmin  = userRole === 'ADMIN'
  const isEditor = userRole === 'EDITOR'
  const isOwner  = gallery.createdById === userId

  async function apiAction(endpoint: string) {
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

  async function handlePublish() {
    setPublishing(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/publish`, { method: 'PATCH' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to publish gallery')
        return
      }
      const url = `https://gallery.cmmschristhood.org/${gallery.slug}`
      setGallery(g => ({ ...g, status: 'PUBLISHED' }))
      setPublishedUrl(url)
      startTransition(() => { router.refresh(); onAction() })
    } finally {
      setPublishing(false)
      setShowPublishDialog(false)
    }
  }

  function handleCopied() {
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const showMenu = userRole !== 'UPLOADER' && (isAdmin || (isEditor && isOwner))

  const date = gallery.publishedAt
    ? `Published ${new Date(gallery.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `Created ${new Date(gallery.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <>
      {/* Card — no overflow-hidden so the kebab dropdown can escape the boundary */}
      <div className={`relative bg-slate-900 border border-slate-800 rounded-2xl flex flex-col
                       transition-all hover:border-slate-700
                       ${busy || pending ? 'opacity-60 pointer-events-none' : ''}`}>

        {/* Cover — own overflow-hidden so the image clips to the rounded top corners */}
        <div className="relative aspect-video bg-slate-800 overflow-hidden rounded-t-2xl">
          {gallery.coverUrl ? (
            <img src={gallery.coverUrl} alt={gallery.title}
                 className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-600">
              <Image className="w-8 h-8" />
              <span className="text-xs">No cover set</span>
            </div>
          )}
        </div>

        {/* Status badge — absolute over the cover */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <GalleryStatusBadge status={gallery.status} />
        </div>

        {/* Three-dot menu — absolute over the cover, z-20 so dropdown overflows card */}
        {showMenu && (
          <div className="absolute top-2.5 right-2.5 z-20">
            <GalleryKebabMenu
              gallery={gallery}
              userRole={userRole}
              userId={userId}
              onApiAction={apiAction}
              onRename={() => setShowRename(true)}
              onDelete={() => setShowDeleteConfirm(true)}
              onCopied={handleCopied}
            />
          </div>
        )}

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

          {/* Inline copy confirmation */}
          {copiedLink && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Link copied!
            </div>
          )}

          {/* Status action hints */}
          {!publishedUrl && gallery.status === 'DRAFT' && (
            <p className="text-[11px] text-slate-600">Needs review before publishing</p>
          )}
          {!publishedUrl && isAdmin && gallery.status === 'PENDING_REVIEW' && (
            <p className="text-[11px] text-amber-500/80 font-medium">Ready to publish</p>
          )}
          {gallery.status === 'ARCHIVED' && (
            <p className="text-[11px] text-slate-600">Not publicly visible</p>
          )}

          {/* Primary CTA row — high-priority actions only; all others live in the three-dot menu */}
          <div className="flex flex-wrap gap-2 mt-auto pt-1">

            {/* PENDING_REVIEW (Admin): Publish Now + Review first */}
            {isAdmin && gallery.status === 'PENDING_REVIEW' && !publishedUrl && (
              <>
                <button
                  onClick={() => setShowPublishDialog(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl
                             bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold
                             px-3 py-2 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Publish Now
                </button>
                <Link href={`/galleries/${gallery.id}/review`}
                      className="inline-flex items-center justify-center gap-1 rounded-xl
                                 border border-slate-600 text-slate-400 hover:text-white
                                 hover:border-slate-500 text-xs px-3 py-2 transition-colors">
                  Review first
                </Link>
              </>
            )}

            {/* After publishing — show live URL with copy */}
            {publishedUrl && (
              <div className="flex-1 space-y-1">
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                  <Check className="w-3.5 h-3.5" /> Gallery published!
                </p>
                <div className="flex items-center gap-1.5">
                  <a href={publishedUrl} target="_blank" rel="noreferrer"
                     className="flex-1 text-[11px] text-indigo-400 hover:underline truncate">
                    {publishedUrl.replace('https://', '')}
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(publishedUrl).catch(() => {}); handleCopied() }}
                    title="Copy link"
                    className="shrink-0 text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Uploaders see a plain View button (no three-dot menu) */}
            {userRole === 'UPLOADER' && (
              <Link href={`/galleries/${gallery.id}/review`}>
                <Button size="sm" variant="ghost"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
              </Link>
            )}

            {/* Editors can view published galleries they don't own */}
            {isEditor && !isOwner && gallery.status === 'PUBLISHED' && (
              <Link href={`/galleries/${gallery.id}/review`}>
                <Button size="sm" variant="ghost"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Rename dialog */}
      {showRename && (
        <RenameDialog
          galleryId={gallery.id}
          currentTitle={gallery.title}
          onClose={() => setShowRename(false)}
          onSaved={newTitle => {
            setGallery(g => ({ ...g, title: newTitle }))
            setShowRename(false)
          }}
        />
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          gallery={gallery}
          isAdmin={isAdmin}
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => {
            setShowDeleteConfirm(false)
            startTransition(() => { router.refresh(); onAction() })
          }}
        />
      )}

      {/* Publish confirm dialog */}
      {showPublishDialog && (
        <PublishConfirmDialog
          gallery={gallery}
          publishing={publishing}
          onClose={() => setShowPublishDialog(false)}
          onConfirm={handlePublish}
        />
      )}
    </>
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
