'use client'

import {
  useState, useRef, useCallback, useTransition, useEffect,
} from 'react'
import { useRouter } from 'next/navigation'
import Link          from 'next/link'
import {
  ArrowLeft, Save, Eye, EyeOff, Trash2, Plus, Upload, Loader2,
  Check, ChevronDown, ChevronRight, SendHorizonal, Globe,
  Lock, Download, UserCheck, Image as ImageIcon, Pencil,
  GalleryHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GalleryFile {
  id:           string
  originalName: string
  thumbnailUrl: string
  previewUrl:   string
  isVisible:    boolean
  sortOrder:    number
  width:        number | null
  height:       number | null
}

interface GallerySection {
  id:         string
  title:      string
  date:       string | null
  sortOrder:  number
  photoCount: number
  files:      GalleryFile[]
}

interface Gallery {
  id:                     string
  slug:                   string
  title:                  string
  description:            string | null
  categoryName:           string | null
  year:                   number
  status:                 string
  coverImageKey:          string | null
  coverUrl:               string | null
  allowDownload:          boolean
  allowFullRes:           boolean
  requireNameForDownload: boolean
  isPasswordProtected:    boolean
  totalPhotos:            number
  createdById:            string
  createdBy:              { id: string; name: string | null; username: string | null }
  sections:               GallerySection[]
}

interface Props {
  gallery:  Gallery
  userRole: 'ADMIN' | 'EDITOR'
  userId:   string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  'Saturday Fellowship',
  'Sunday Service',
  'Missions',
  'Youth Ministry',
  'Prayer Meeting',
  'Special Event',
  'Outreach',
  'Conference',
  'Training',
  'Other',
]

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff'

// ─── Upload item ──────────────────────────────────────────────────────────────

interface UploadItem {
  id:         string
  name:       string
  progress:   number    // 0-100
  status:     'pending' | 'uploading' | 'done' | 'error'
  error?:     string
}

// ─── Section component ────────────────────────────────────────────────────────

function SectionCard({
  section,
  galleryId,
  onDeleted,
  onFileRemoved,
  onVisibilityToggled,
  onCoverSet,
  onUploadsComplete,
}: {
  section:             GallerySection
  galleryId:           string
  onDeleted:           (id: string) => void
  onFileRemoved:       (sectionId: string, fileId: string) => void
  onVisibilityToggled: (sectionId: string, fileId: string, visible: boolean) => void
  onCoverSet:          (fileId: string) => void
  onUploadsComplete:   (sectionId: string, newFiles: GalleryFile[]) => void
}) {
  const [collapsed,   setCollapsed]   = useState(false)
  const [editing,     setEditing]     = useState(false)
  const [titleInput,  setTitleInput]  = useState(section.title)
  const [dateInput,   setDateInput]   = useState(
    section.date ? section.date.slice(0, 10) : '',
  )
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [uploads,     setUploads]     = useState<UploadItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function saveSection() {
    setSaving(true)
    try {
      await fetch(`/api/gallery/${galleryId}/sections/${section.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title: titleInput.trim() || section.title,
          date:  dateInput || null,
        }),
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function deleteSection() {
    if (!confirm(`Delete section "${section.title}" and all its photos? This cannot be undone.`))
      return
    setDeleting(true)
    try {
      await fetch(`/api/gallery/${galleryId}/sections/${section.id}`, { method: 'DELETE' })
      onDeleted(section.id)
    } finally { setDeleting(false) }
  }

  async function toggleVisibility(file: GalleryFile) {
    const res = await fetch(`/api/gallery/${galleryId}/files/${file.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isVisible: !file.isVisible }),
    })
    if (res.ok) onVisibilityToggled(section.id, file.id, !file.isVisible)
  }

  async function removeFile(file: GalleryFile) {
    if (!confirm(`Remove "${file.originalName}"?`)) return
    const res = await fetch(`/api/gallery/${galleryId}/files/${file.id}`, { method: 'DELETE' })
    if (res.ok) onFileRemoved(section.id, file.id)
  }

  function pickFiles() { fileInputRef.current?.click() }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''

    const items: UploadItem[] = files.map(f => ({
      id:       `${Date.now()}-${f.name}`,
      name:     f.name,
      progress: 0,
      status:   'pending',
    }))
    setUploads(prev => [...prev, ...items])

    files.forEach((file, i) => uploadFile(file, items[i].id))
  }

  function uploadFile(file: File, uploadId: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sectionId', section.id)

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 90)
        setUploads(prev =>
          prev.map(u => u.id === uploadId ? { ...u, progress, status: 'uploading' } : u),
        )
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        setUploads(prev =>
          prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: 'done' } : u),
        )
        // Build GalleryFile from response
        const newFile: GalleryFile = {
          id:           data.file.id,
          originalName: file.name,
          thumbnailUrl: data.urls.thumbnail,
          previewUrl:   data.urls.preview,
          isVisible:    true,
          sortOrder:    0,
          width:        data.file.width ?? null,
          height:       data.file.height ?? null,
        }
        onUploadsComplete(section.id, [newFile])
      } else {
        let errMsg = 'Upload failed'
        try { errMsg = JSON.parse(xhr.responseText).error ?? errMsg } catch { /* */ }
        setUploads(prev =>
          prev.map(u => u.id === uploadId ? { ...u, status: 'error', error: errMsg } : u),
        )
      }
    }

    xhr.onerror = () => {
      setUploads(prev =>
        prev.map(u => u.id === uploadId ? { ...u, status: 'error', error: 'Network error' } : u),
      )
    }

    xhr.open('POST', `/api/gallery/${galleryId}/upload`)
    xhr.send(formData)

    setUploads(prev =>
      prev.map(u => u.id === uploadId ? { ...u, status: 'uploading' } : u),
    )
  }

  const files = section.files

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden
                     ${deleting ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/70">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="shrink-0 text-slate-400 hover:text-white transition-colors"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronDown  className="w-4 h-4" />}
        </button>

        {editing ? (
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <input
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg
                         px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              placeholder="Section title"
            />
            <input
              type="date"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5
                         text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <button onClick={saveSection} disabled={saving}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300
                               transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={() => setEditing(false)}
                    className="text-xs text-slate-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-white truncate">{section.title}</span>
              {section.date && (
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(section.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500 ml-1 shrink-0">
              {files.length} photo{files.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Edit section"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={deleteSection}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
              title="Delete section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Photo grid + uploads (hidden when collapsed) */}
      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Photo grid */}
          {files.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {files.map(file => (
                <div key={file.id}
                     className="relative group aspect-square rounded-xl overflow-hidden
                                bg-slate-800 border border-slate-700/50">
                  <img
                    src={file.thumbnailUrl}
                    alt={file.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {!file.isVisible && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <EyeOff className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  {/* Hover controls */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100
                                  transition-opacity flex flex-col">
                    <div className="flex justify-end gap-1 p-1.5">
                      <button
                        onClick={() => toggleVisibility(file)}
                        title={file.isVisible ? 'Hide photo' : 'Show photo'}
                        className="p-1 rounded-lg bg-slate-900/80 text-slate-200
                                   hover:bg-slate-800 transition-colors"
                      >
                        {file.isVisible
                          ? <Eye  className="w-3.5 h-3.5" />
                          : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => onCoverSet(file.id)}
                        title="Set as gallery cover"
                        className="p-1 rounded-lg bg-slate-900/80 text-slate-200
                                   hover:bg-amber-700 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeFile(file)}
                        title="Remove photo"
                        className="p-1 rounded-lg bg-slate-900/80 text-slate-200
                                   hover:bg-red-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-auto px-1.5 pb-1.5">
                      <p className="text-[10px] text-white/90 truncate">{file.originalName}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              No photos in this section yet
            </p>
          )}

          {/* Upload progress items */}
          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map(u => (
                <div key={u.id}
                     className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm
                       ${u.status === 'error' ? 'bg-red-950/40 border border-red-800/50' : 'bg-slate-800/60'}`}>
                  {u.status === 'done' ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : u.status === 'error' ? (
                    <span className="text-red-400 shrink-0 text-xs">✕</span>
                  ) : (
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">
                      {u.status === 'uploading'
                        ? `Processing ${u.name} — preserving original quality…`
                        : u.status === 'done'
                        ? `Added ✓ ${u.name}`
                        : u.status === 'error'
                        ? u.error ?? 'Upload failed'
                        : u.name}
                    </p>
                    {u.status === 'uploading' && (
                      <div className="mt-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                             style={{ width: `${u.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Photos button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <button
              onClick={pickFiles}
              className="flex items-center gap-2 rounded-xl border border-dashed border-slate-700
                         px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:border-indigo-500
                         hover:bg-indigo-500/5 transition-all w-full justify-center"
            >
              <Upload className="w-4 h-4" />
              Add Photos to this section
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function GalleryEditorClient({ gallery: initial, userRole, userId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Settings state
  const [gallery,     setGallery]     = useState(initial)
  const [saving,      setSaving]      = useState(false)
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitting,  setSubmitting]  = useState(false)
  const [publishing,  setPublishing]  = useState(false)

  // Section state (local optimistic copy)
  const [sections,  setSections]  = useState<GallerySection[]>(initial.sections)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionDate,  setNewSectionDate]  = useState('')

  // Auto-save timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleSave(patch: Partial<typeof gallery>) {
    setGallery(g => ({ ...g, ...patch }))
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(patch), 1000)
  }

  async function doSave(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      setSaveStatus(res.ok ? 'saved' : 'error')
    } catch {
      setSaveStatus('error')
    } finally { setSaving(false) }
  }

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function addSection() {
    if (!newSectionTitle.trim()) return
    setAddingSection(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/sections`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:     newSectionTitle.trim(),
          date:      newSectionDate || null,
          sortOrder: sections.length,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSections(s => [...s, { ...data.section, date: data.section.date ?? null, files: [], photoCount: 0 }])
        setNewSectionTitle('')
        setNewSectionDate('')
      }
    } finally { setAddingSection(false) }
  }

  function handleSectionDeleted(sectionId: string) {
    setSections(s => s.filter(sec => sec.id !== sectionId))
  }

  function handleFileRemoved(sectionId: string, fileId: string) {
    setSections(s => s.map(sec =>
      sec.id !== sectionId ? sec : {
        ...sec,
        files:      sec.files.filter(f => f.id !== fileId),
        photoCount: Math.max(0, sec.photoCount - 1),
      },
    ))
    setGallery(g => ({ ...g, totalPhotos: Math.max(0, g.totalPhotos - 1) }))
  }

  function handleVisibilityToggled(sectionId: string, fileId: string, visible: boolean) {
    setSections(s => s.map(sec =>
      sec.id !== sectionId ? sec : {
        ...sec,
        files: sec.files.map(f => f.id !== fileId ? f : { ...f, isVisible: visible }),
      },
    ))
  }

  async function handleCoverSet(fileId: string) {
    const res = await fetch(`/api/gallery/${gallery.id}/cover`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fileId }),
    })
    if (res.ok) {
      // Find the file to get its thumbnailUrl as the new coverUrl
      for (const s of sections) {
        const f = s.files.find(f => f.id === fileId)
        if (f) { setGallery(g => ({ ...g, coverUrl: f.thumbnailUrl })); break }
      }
    }
  }

  function handleUploadsComplete(sectionId: string, newFiles: GalleryFile[]) {
    setSections(s => s.map(sec =>
      sec.id !== sectionId ? sec : {
        ...sec,
        files:      [...sec.files, ...newFiles],
        photoCount: sec.photoCount + newFiles.length,
      },
    ))
    setGallery(g => ({ ...g, totalPhotos: g.totalPhotos + newFiles.length }))
  }

  async function submitForReview() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/submit`, { method: 'PATCH' })
      if (res.ok) {
        setGallery(g => ({ ...g, status: 'PENDING_REVIEW' }))
        startTransition(() => router.refresh())
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to submit gallery for review')
      }
    } finally { setSubmitting(false) }
  }

  async function publishNow() {
    if (!confirm('Publish this gallery now? It will immediately be visible at the public URL.')) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/publish`, { method: 'PATCH' })
      if (res.ok) {
        setGallery(g => ({ ...g, status: 'PUBLISHED' }))
        // Stay on the editor so sections and photos can be added right away
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to publish gallery')
      }
    } finally { setPublishing(false) }
  }

  const isDraft         = gallery.status === 'DRAFT'
  const isPendingReview = gallery.status === 'PENDING_REVIEW'
  const isPublished     = gallery.status === 'PUBLISHED'

  return (
    <div className="flex flex-col min-h-screen -mx-4 sm:-mx-8 -mt-6 sm:-mt-8">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3
                      bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/70 shrink-0">
        <Link href="/galleries"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white
                         transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Galleries
        </Link>
        <span className="text-slate-700">/</span>
        <p className="text-sm text-slate-200 font-medium truncate flex-1">{gallery.title}</p>

        {/* Save status */}
        <div className="shrink-0 text-xs">
          {saveStatus === 'saving' && (
            <span className="text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-400">Save failed</span>
          )}
        </div>

        {/* Status badge */}
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset
          ${gallery.status === 'DRAFT'          ? 'bg-slate-700/80 text-slate-300 ring-slate-600' : ''}
          ${gallery.status === 'PENDING_REVIEW' ? 'bg-amber-950/80 text-amber-400 ring-amber-800' : ''}
          ${gallery.status === 'PUBLISHED'      ? 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' : ''}
        `}>
          {gallery.status === 'DRAFT' ? 'Draft' : gallery.status === 'PENDING_REVIEW' ? 'Pending Review' : 'Published'}
        </span>
      </div>

      {/* ── Two-column body ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 flex-1">
        {/* ── LEFT: Settings ─────────────────────────────────────────────── */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-5">
          {/* Cover */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="relative aspect-video bg-slate-800 flex items-center justify-center">
              {gallery.coverUrl ? (
                <img src={gallery.coverUrl} alt="Gallery cover"
                     className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-xs">No cover set</span>
                </div>
              )}
              <div className="absolute bottom-2 right-2">
                <span className="text-[10px] bg-black/60 text-slate-300 px-2 py-1 rounded-lg">
                  Click a photo → set as cover
                </span>
              </div>
            </div>
          </div>

          {/* Metadata form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Gallery Settings</h2>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
              <input
                value={gallery.title}
                onChange={e => scheduleSave({ title: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
              <textarea
                value={gallery.description ?? ''}
                onChange={e => scheduleSave({ description: e.target.value || null })}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Optional gallery description…"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <select
                value={gallery.categoryName ?? ''}
                onChange={e => scheduleSave({ categoryName: e.target.value || null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Select category —</option>
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Year</label>
              <input
                type="number"
                value={gallery.year}
                min={2000}
                max={2099}
                onChange={e => scheduleSave({ year: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Slug</label>
              <input
                value={gallery.slug}
                onChange={e => scheduleSave({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-500 truncate">
                gallery.cmmschristhood.org/<span className="text-indigo-400">{gallery.slug}</span>
              </p>
            </div>
          </div>

          {/* Access settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Access & Downloads</h2>

            {/* Allow downloads */}
            <Toggle
              icon={<Download className="w-4 h-4" />}
              label="Allow downloads"
              description="Visitors can download photos"
              checked={gallery.allowDownload}
              onChange={v => scheduleSave({ allowDownload: v })}
            />

            {/* Require name */}
            <Toggle
              icon={<UserCheck className="w-4 h-4" />}
              label="Require name for download"
              description="Collect visitor name before download"
              checked={gallery.requireNameForDownload}
              onChange={v => scheduleSave({ requireNameForDownload: v })}
              disabled={!gallery.allowDownload}
            />

            {/* Password protection */}
            <Toggle
              icon={<Lock className="w-4 h-4" />}
              label="Password protection"
              description="Require a password to view"
              checked={gallery.isPasswordProtected}
              onChange={v => scheduleSave({ isPasswordProtected: v })}
            />
          </div>
        </div>

        {/* ── RIGHT: Sections & photos ────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <GalleryHorizontal className="w-4 h-4 text-indigo-400" />
              Sections & Photos
              <span className="text-slate-500 font-normal">({gallery.totalPhotos} total)</span>
            </h2>
          </div>

          {/* Sections */}
          {sections.length === 0 && (
            <div className="border border-dashed border-slate-700 rounded-2xl py-12 text-center">
              <GalleryHorizontal className="w-8 h-8 mx-auto text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No sections yet</p>
              <p className="text-slate-600 text-xs mt-1">Add a section to start organising photos</p>
            </div>
          )}

          {sections.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              galleryId={gallery.id}
              onDeleted={handleSectionDeleted}
              onFileRemoved={handleFileRemoved}
              onVisibilityToggled={handleVisibilityToggled}
              onCoverSet={handleCoverSet}
              onUploadsComplete={handleUploadsComplete}
            />
          ))}

          {/* Add section form */}
          <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSection()}
                placeholder="New section title…"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl
                           px-3 py-2 text-sm text-white placeholder-slate-600
                           focus:outline-none focus:border-indigo-500"
              />
              <input
                type="date"
                value={newSectionDate}
                onChange={e => setNewSectionDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-indigo-500 w-40"
                title="Section date (optional)"
              />
              <Button size="sm" variant="secondary"
                      onClick={addSection} disabled={addingSection || !newSectionTitle.trim()}
                      className="flex items-center gap-1.5 whitespace-nowrap">
                {addingSection
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Plus className="w-3.5 h-3.5" />}
                Add Section
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3
                      px-4 sm:px-6 py-3 bg-slate-950/95 backdrop-blur-sm
                      border-t border-slate-800/70 mt-auto">
        <div className="text-sm text-slate-400">
          {isDraft         && 'Draft — not yet visible to the public'}
          {isPendingReview && 'Pending Review — waiting for admin approval'}
          {isPublished     && (
            <a href={`https://gallery.cmmschristhood.org/${gallery.slug}`}
               target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors">
              <Globe className="w-4 h-4" />
              gallery.cmmschristhood.org/{gallery.slug}
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDraft && userRole === 'EDITOR' && (
            <Button variant="secondary" size="sm"
                    onClick={submitForReview} disabled={submitting}
                    className="flex items-center gap-1.5">
              {submitting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
                : <><SendHorizonal className="w-3.5 h-3.5" /> Submit for Review</>}
            </Button>
          )}
          {(isDraft || isPendingReview) && userRole === 'ADMIN' && (
            <Button variant="primary" size="sm"
                    onClick={publishNow} disabled={publishing}
                    className="flex items-center gap-1.5 !bg-emerald-700 hover:!bg-emerald-600">
              {publishing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
                : <><Globe className="w-3.5 h-3.5" /> Publish Now</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  icon, label, description, checked, onChange, disabled = false,
}: {
  icon:        React.ReactNode
  label:       string
  description: string
  checked:     boolean
  onChange:    (v: boolean) => void
  disabled?:   boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-sm text-slate-200">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative shrink-0 w-10 h-5.5 rounded-full border transition-colors
          ${checked
            ? 'bg-indigo-600 border-indigo-500'
            : 'bg-slate-700 border-slate-600'}
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ height: '22px' }}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                          transition-transform duration-200
                          ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
