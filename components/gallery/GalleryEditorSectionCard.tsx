'use client'

import { useRef, useState } from 'react'
import {
  Check, ChevronDown, ChevronRight, Eye, EyeOff, Image as ImageIcon,
  Loader2, Pencil, Trash2, Upload,
} from 'lucide-react'

export interface GalleryFile {
  id: string
  originalName: string
  thumbnailUrl: string
  previewUrl: string
  isVisible: boolean
  sortOrder: number
  width: number | null
  height: number | null
}

export interface GallerySection {
  id: string
  title: string
  date: string | null
  sortOrder: number
  photoCount: number
  files: GalleryFile[]
}

interface UploadItem {
  id: string
  name: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

interface Props {
  section: GallerySection
  galleryId: string
  onDeleted: (id: string) => void
  onFileRemoved: (sectionId: string, fileId: string) => void
  onVisibilityToggled: (sectionId: string, fileId: string, visible: boolean) => void
  onCoverSet: (fileId: string) => void
  onUploadsComplete: (sectionId: string, newFiles: GalleryFile[]) => void
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/tiff'

export function GalleryEditorSectionCard({
  section,
  galleryId,
  onDeleted,
  onFileRemoved,
  onVisibilityToggled,
  onCoverSet,
  onUploadsComplete,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [titleInput, setTitleInput] = useState(section.title)
  const [dateInput, setDateInput] = useState(section.date ? section.date.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function saveSection() {
    setSaving(true)
    try {
      await fetch(`/api/gallery/${galleryId}/sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim() || section.title,
          date: dateInput || null,
        }),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSection() {
    if (!confirm(`Delete section "${section.title}" and all its photos? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/gallery/${galleryId}/sections/${section.id}`, { method: 'DELETE' })
      onDeleted(section.id)
    } finally {
      setDeleting(false)
    }
  }

  async function toggleVisibility(file: GalleryFile) {
    const res = await fetch(`/api/gallery/${galleryId}/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVisible: !file.isVisible }),
    })
    if (res.ok) onVisibilityToggled(section.id, file.id, !file.isVisible)
  }

  async function removeFile(file: GalleryFile) {
    if (!confirm(`Remove "${file.originalName}"?`)) return
    const res = await fetch(`/api/gallery/${galleryId}/files/${file.id}`, { method: 'DELETE' })
    if (res.ok) onFileRemoved(section.id, file.id)
  }

  function pickFiles() {
    fileInputRef.current?.click()
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''

    const items: UploadItem[] = files.map((f) => ({
      id: `${Date.now()}-${f.name}`,
      name: f.name,
      progress: 0,
      status: 'pending',
    }))
    setUploads((prev) => [...prev, ...items])

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
        setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress, status: 'uploading' } : u)))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress: 100, status: 'done' } : u)))
        const newFile: GalleryFile = {
          id: data.file.id,
          originalName: file.name,
          thumbnailUrl: data.urls.thumbnail,
          previewUrl: data.urls.preview,
          isVisible: true,
          sortOrder: 0,
          width: data.file.width ?? null,
          height: data.file.height ?? null,
        }
        onUploadsComplete(section.id, [newFile])
      } else {
        let errMsg = 'Upload failed'
        try {
          errMsg = JSON.parse(xhr.responseText).error ?? errMsg
        } catch {}
        setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'error', error: errMsg } : u)))
      }
    }

    xhr.onerror = () => {
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'error', error: 'Network error' } : u)))
    }

    xhr.open('POST', `/api/gallery/${galleryId}/upload`)
    xhr.send(formData)

    setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'uploading' } : u)))
  }

  const files = section.files

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden ${deleting ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/70">
        <button onClick={() => setCollapsed((c) => !c)} className="shrink-0 text-slate-400 hover:text-white transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {editing ? (
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              placeholder="Section title"
            />
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <button onClick={saveSection} disabled={saving} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-white transition-colors">
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
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Edit section">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={deleteSection} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors" title="Delete section">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {files.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {files.map((file) => (
                <div key={file.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-800 border border-slate-700/50">
                  <img src={file.thumbnailUrl} alt={file.originalName} className="w-full h-full object-cover" loading="lazy" />
                  {!file.isVisible && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <EyeOff className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col">
                    <div className="flex justify-end gap-1 p-1.5">
                      <button onClick={() => toggleVisibility(file)} title={file.isVisible ? 'Hide photo' : 'Show photo'} className="p-1 rounded-lg bg-slate-900/80 text-slate-200 hover:bg-slate-800 transition-colors">
                        {file.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => onCoverSet(file.id)} title="Set as gallery cover" className="p-1 rounded-lg bg-slate-900/80 text-slate-200 hover:bg-amber-700 transition-colors">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeFile(file)} title="Remove photo" className="p-1 rounded-lg bg-slate-900/80 text-slate-200 hover:bg-red-700 transition-colors">
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
            <p className="text-sm text-slate-500 text-center py-4">No photos in this section yet</p>
          )}

          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${u.status === 'error' ? 'bg-red-950/40 border border-red-800/50' : 'bg-slate-800/60'}`}>
                  {u.status === 'done' ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : u.status === 'error' ? (
                    <span className="text-red-400 shrink-0 text-xs">×</span>
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
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${u.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <input ref={fileInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleFiles} />
            <button
              onClick={pickFiles}
              className="flex items-center gap-2 rounded-xl border border-dashed border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:border-indigo-500 hover:bg-indigo-500/5 transition-all w-full justify-center"
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
