'use client'

import {
  useState, useRef, useTransition, useEffect,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  GalleryHorizontal,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
  SendHorizonal,
  UserCheck,
} from 'lucide-react'
import {
  GalleryEditorSectionCard,
  type GalleryFile,
  type GallerySection,
} from '@/components/gallery/GalleryEditorSectionCard'
import { GallerySettingToggle } from '@/components/gallery/GallerySettingToggle'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/lib/toast'

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

export function GalleryEditorClient({ gallery: initial, userRole }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [gallery, setGallery] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [publishSuccessUrl, setPublishSuccessUrl] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPwdInput, setShowPwdInput] = useState(false)

  const [sections, setSections] = useState<GallerySection[]>(initial.sections)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionDate, setNewSectionDate] = useState('')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleSave(patch: Partial<typeof gallery>) {
    setGallery(g => ({ ...g, ...patch }))
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void doSave(patch), 1000)
  }

  async function doSave(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSaveStatus(res.ok ? 'saved' : 'error')
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  async function addSection() {
    if (!newSectionTitle.trim()) return
    setAddingSection(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSectionTitle.trim(),
          date: newSectionDate || null,
          sortOrder: sections.length,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSections(s => [
          ...s,
          { ...data.section, date: data.section.date ?? null, files: [], photoCount: 0 },
        ])
        setNewSectionTitle('')
        setNewSectionDate('')
      }
    } finally {
      setAddingSection(false)
    }
  }

  function handleSectionDeleted(sectionId: string) {
    setSections(s => s.filter(sec => sec.id !== sectionId))
  }

  function handleFileRemoved(sectionId: string, fileId: string) {
    setSections(s => s.map(sec =>
      sec.id !== sectionId ? sec : {
        ...sec,
        files: sec.files.filter(f => f.id !== fileId),
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })

    if (!res.ok) return

    for (const section of sections) {
      const file = section.files.find(item => item.id === fileId)
      if (file) {
        setGallery(g => ({ ...g, coverUrl: file.thumbnailUrl }))
        break
      }
    }
  }

  function handleUploadsComplete(sectionId: string, newFiles: GalleryFile[]) {
    setSections(s => s.map(sec =>
      sec.id !== sectionId ? sec : {
        ...sec,
        files: [...sec.files, ...newFiles],
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
        toast.success(`"${gallery.title}" submitted for review.`)
        startTransition(() => router.refresh())
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to submit gallery for review.')
      }
    } catch {
      toast.error('Network error while submitting the gallery. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function publishNow() {
    setShowPublishDialog(true)
  }

  async function doPublish() {
    setShowPublishDialog(false)
    setPublishing(true)
    try {
      const res = await fetch(`/api/gallery/${gallery.id}/publish`, { method: 'PATCH' })
      if (res.ok) {
        setGallery(g => ({ ...g, status: 'PUBLISHED' }))
        setPublishSuccessUrl(`https://gallery.cmmschristhood.org/${gallery.slug}`)
        toast.success(`"${gallery.title}" published successfully.`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to publish gallery.')
      }
    } catch {
      toast.error('Network error while publishing the gallery. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const isDraft = gallery.status === 'DRAFT'
  const isPendingReview = gallery.status === 'PENDING_REVIEW'
  const isPublished = gallery.status === 'PUBLISHED'

  return (
    <div className="flex flex-col min-h-screen -mx-4 sm:-mx-8 -mt-6 sm:-mt-8">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/70 shrink-0">
        <Link
          href="/galleries"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Galleries
        </Link>
        <span className="text-slate-700">/</span>
        <p className="text-sm text-slate-200 font-medium truncate flex-1">{gallery.title}</p>

        <div className="shrink-0 text-xs">
          {saveStatus === 'saving' && (
            <span className="text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
          {saveStatus === 'error' && <span className="text-red-400">Save failed</span>}
        </div>

        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-semibold ring-1 ring-inset
          ${gallery.status === 'DRAFT' ? 'bg-slate-700/80 text-slate-300 ring-slate-600' : ''}
          ${gallery.status === 'PENDING_REVIEW' ? 'bg-amber-950/80 text-amber-400 ring-amber-800' : ''}
          ${gallery.status === 'PUBLISHED' ? 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' : ''}`}
        >
          {gallery.status === 'DRAFT'
            ? 'Draft'
            : gallery.status === 'PENDING_REVIEW'
              ? 'Pending Review'
              : 'Published'}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 flex-1">
        <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="relative aspect-video bg-slate-800 flex items-center justify-center">
              {gallery.coverUrl ? (
                <img src={gallery.coverUrl} alt="Gallery cover" className="w-full h-full object-cover" />
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

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Gallery Settings</h2>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
              <input
                value={gallery.title}
                onChange={e => scheduleSave({ title: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
              <textarea
                value={gallery.description ?? ''}
                onChange={e => scheduleSave({ description: e.target.value || null })}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Optional gallery description…"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <select
                value={gallery.categoryName ?? ''}
                onChange={e => scheduleSave({ categoryName: e.target.value || null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Select category —</option>
                {CATEGORY_OPTIONS.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Year</label>
              <input
                type="number"
                value={gallery.year}
                min={2000}
                max={2099}
                onChange={e => scheduleSave({ year: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Slug</label>
              <input
                value={gallery.slug}
                onChange={e => scheduleSave({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-500 truncate">
                gallery.cmmschristhood.org/<span className="text-indigo-400">{gallery.slug}</span>
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Access & Downloads</h2>

            <GallerySettingToggle
              icon={<Download className="w-4 h-4" />}
              label="Allow downloads"
              description="Visitors can download photos"
              checked={gallery.allowDownload}
              onChange={v => scheduleSave({ allowDownload: v })}
            />

            <GallerySettingToggle
              icon={<UserCheck className="w-4 h-4" />}
              label="Require name for download"
              description="Collect visitor name before download"
              checked={gallery.requireNameForDownload}
              onChange={v => scheduleSave({ requireNameForDownload: v })}
              disabled={!gallery.allowDownload}
            />

            <div className="space-y-3">
              <GallerySettingToggle
                icon={<Lock className="w-4 h-4" />}
                label="Password protection"
                description="Require a password to view"
                checked={gallery.isPasswordProtected}
                onChange={v => {
                  if (!v) {
                    setShowPwdInput(false)
                    setPasswordInput('')
                    setGallery(g => ({ ...g, isPasswordProtected: false }))
                    void doSave({ isPasswordProtected: false, password: null })
                    return
                  }

                  setShowPwdInput(true)
                  setGallery(g => ({ ...g, isPasswordProtected: true }))
                }}
              />

              {(gallery.isPasswordProtected || showPwdInput) && (
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={gallery.isPasswordProtected ? 'Set new password…' : 'Enter password…'}
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    disabled={!passwordInput.trim()}
                    onClick={() => {
                      if (!passwordInput.trim()) return
                      setGallery(g => ({ ...g, isPasswordProtected: true }))
                      void doSave({ isPasswordProtected: true, password: passwordInput.trim() })
                      setPasswordInput('')
                      setShowPwdInput(false)
                    }}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Save password"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <GalleryHorizontal className="w-4 h-4 text-indigo-400" />
              Sections & Photos
              <span className="text-slate-500 font-normal">({gallery.totalPhotos} total)</span>
            </h2>
          </div>

          {sections.length === 0 && (
            <div className="border border-dashed border-slate-700 rounded-2xl py-12 text-center">
              <GalleryHorizontal className="w-8 h-8 mx-auto text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No sections yet</p>
              <p className="text-slate-600 text-xs mt-1">Add a section to start organising photos</p>
            </div>
          )}

          {sections.map(section => (
            <GalleryEditorSectionCard
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

          <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void addSection()}
                placeholder="New section title…"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="date"
                value={newSectionDate}
                onChange={e => setNewSectionDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-40"
                title="Section date (optional)"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void addSection()}
                disabled={addingSection || !newSectionTitle.trim()}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                {addingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Section
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-slate-950/95 backdrop-blur-sm border-t border-slate-800/70 mt-auto">
        <div className="text-sm text-slate-400">
          {publishSuccessUrl ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Gallery published!
              </span>
              <a href={publishSuccessUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline">
                {publishSuccessUrl.replace('https://', '')}
              </a>
            </div>
          ) : (
            <>
              {isDraft && 'Draft — not yet visible to the public'}
              {isPendingReview && 'Pending Review — waiting for admin approval'}
              {isPublished && (
                <a
                  href={`https://gallery.cmmschristhood.org/${gallery.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  gallery.cmmschristhood.org/{gallery.slug}
                </a>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {publishSuccessUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(publishSuccessUrl).catch(() => {})}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy link
            </button>
          )}

          {isDraft && userRole === 'EDITOR' && (
            <Button variant="secondary" size="md" onClick={() => void submitForReview()} disabled={submitting} className="flex items-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><SendHorizonal className="w-4 h-4" /> Submit for Review</>}
            </Button>
          )}

          {(isDraft || isPendingReview) && userRole === 'ADMIN' && (
            <Button variant="primary" size="md" onClick={publishNow} disabled={publishing} className="flex items-center gap-2 !bg-emerald-600 hover:!bg-emerald-500">
              {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : <><CheckCircle2 className="w-4 h-4" /> Publish Now</>}
            </Button>
          )}
        </div>
      </div>

      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPublishDialog(false)} />
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
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowPublishDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1 flex items-center justify-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-500"
                onClick={() => void doPublish()}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
