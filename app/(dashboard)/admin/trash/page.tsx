'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Trash2, RotateCcw, Clock, AlertTriangle, Loader2,
  RefreshCw, ShieldAlert, FileImage, FileVideo, Info, XCircle,
  GalleryHorizontal, ArrowUpDown,
} from 'lucide-react'
import { invalidateFileCache } from '@/lib/cache'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface TrashedFile {
  id:           string
  originalName: string
  storedName:   string
  r2Key:        string
  fileType:     'PHOTO' | 'VIDEO'
  fileSize:     number
  status:       string
  event:        { id: string; name: string } | null
  subfolder:    { id: string; label: string } | null
}

interface TrashEntry {
  id:               string
  mediaFileId:      string
  deletedAt:        string
  scheduledPurgeAt: string
  preDeleteStatus:  string
  deletedBy:        { id: string; username: string | null; email: string }
  mediaFile:        TrashedFile
}

interface PageData {
  items: TrashEntry[]
  total: number
  page:  number
  limit: number
  pages: number
}

interface GalleryTrashItem {
  id:              string
  slug:            string
  title:           string
  coverUrl:        string | null
  status:          string
  categoryName:    string | null
  year:            number
  totalPhotos:     number
  fileCount:       number
  deletedAt:       string
  purgesAt:        string
  preDeleteStatus: string | null
  deletedBy:       { id: string; username: string | null; email: string }
}

interface GalleryTrashData {
  items: GalleryTrashItem[]
  total: number
  page:  number
  limit: number
  pages: number
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function daysRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function hoursRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60)))
}

function urgencyClass(purgeAt: string) {
  const days = daysRemaining(purgeAt)
  if (days <= 3)  return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (days <= 10) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return                  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

function purgeLabel(purgeAt: string) {
  const days  = daysRemaining(purgeAt)
  const hours = hoursRemaining(purgeAt)
  if (days === 0 && hours === 0) return 'Purge imminent'
  if (days === 0)                return `${hours}h remaining`
  if (days === 1)                return '1 day remaining'
  return `${days} days remaining`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return                         `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminTrashPage() {
  const [data,         setData]         = useState<PageData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState('')
  const [restoring,    setRestoring]    = useState<string>('')
  const [purging,      setPurging]      = useState<string>('')
  const [page,         setPage]         = useState(1)
  const [activeTab,    setActiveTab]    = useState<'FILES' | 'GALLERIES'>('FILES')
  const [gData,        setGData]        = useState<GalleryTrashData | null>(null)
  const [gLoading,     setGLoading]     = useState(false)
  const [gError,       setGError]       = useState('')
  const [gPage,        setGPage]        = useState(1)
  const [restoringG,   setRestoringG]   = useState('')
  const [purgingG,     setPurgingG]     = useState('')
  // sort: files sort by purge date or deletion date; galleries likewise
  const [fileSort,  setFileSort]  = useState<'purge_asc' | 'purge_desc' | 'deleted_asc' | 'deleted_desc'>('purge_asc')
  const [galSort,   setGalSort]   = useState<'deleted_desc' | 'deleted_asc' | 'purge_asc' | 'purge_desc'>('deleted_desc')
  const LIMIT   = 50
  const G_LIMIT = 20

  // â”€â”€ Fetch files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchTrash = useCallback(async (pg = page, sort = fileSort) => {
    setLoading(true)
    setFetchError('')
    try {
      const res = await fetch(`/api/admin/trash?page=${pg}&limit=${LIMIT}&sort=${sort}`)
      const body = await res.json()
      if (!res.ok) {
        setFetchError(body?.error ?? `Server error ${res.status}`)
        return
      }
      setData(body as PageData)
    } catch (err) {
      setFetchError('Network error — could not load trash. Please refresh.')
      console.error('[AdminTrashPage] fetchTrash error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, fileSort])

  // â”€â”€ Fetch galleries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchGalleryTrash = useCallback(async (pg = gPage, sort = galSort) => {
    setGLoading(true)
    setGError('')
    try {
      const res  = await fetch(`/api/admin/gallery-trash?page=${pg}&limit=${G_LIMIT}&sort=${sort}`)
      const body = await res.json()
      if (!res.ok) { setGError(body?.error ?? `Server error ${res.status}`); return }
      setGData(body as GalleryTrashData)
    } catch {
      setGError('Network error — could not load gallery trash. Please refresh.')
    } finally {
      setGLoading(false)
    }
  }, [gPage, galSort])

  useEffect(() => {
    if (activeTab === 'FILES')     fetchTrash(page, fileSort)
    else                           fetchGalleryTrash(gPage, galSort)
  }, [page, gPage, activeTab, fileSort, galSort])

  // â”€â”€ Restore file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleRestore(trashItemId: string, fileName: string) {
    if (!confirm(`Restore "${fileName}"? It will return to its previous status.`)) return

    setRestoring(trashItemId)
    try {
      const res = await fetch(`/api/admin/trash/${trashItemId}/restore`, { method: 'POST' })
      const body = await res.json()

      if (!res.ok) {
        alert(`Restore failed: ${body.error ?? 'Unknown error'}`)
        return
      }

      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== trashItemId), total: prev.total - 1 }
        : prev
      )
      void invalidateFileCache()
    } catch {
      alert('Network error â€” please try again.')
    } finally {
      setRestoring('')
    }
  }

  // â”€â”€ Permanent purge file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handlePurge(trashItemId: string, fileName: string) {
    if (!confirm(
      `Permanently delete "${fileName}"?\n\nThis will immediately remove the file from storage. This cannot be undone.`
    )) return

    setPurging(trashItemId)
    try {
      const res  = await fetch(`/api/admin/trash/${trashItemId}`, { method: 'DELETE' })
      const body = await res.json()

      if (!res.ok) {
        alert(`Purge failed: ${body.error ?? 'Unknown error'}`)
        return
      }

      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== trashItemId), total: prev.total - 1 }
        : prev
      )
    } catch {
      alert('Network error â€” please try again.')
    } finally {
      setPurging('')
    }
  }

  // â”€â”€ Restore gallery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleRestoreGallery(galleryId: string, title: string) {
    if (!confirm(`Restore "${title}"? The gallery will return to its previous status.`)) return

    setRestoringG(galleryId)
    try {
      const res  = await fetch(`/api/gallery/${galleryId}/restore`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { alert(`Restore failed: ${body.error ?? 'Unknown error'}`); return }
      setGData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== galleryId), total: prev.total - 1 }
        : prev
      )
    } catch {
      alert('Network error â€” please try again.')
    } finally {
      setRestoringG('')
    }
  }

  // â”€â”€ Purge gallery immediately â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handlePurgeGallery(galleryId: string, title: string, fileCount: number) {
    if (!confirm(
      `Permanently delete "${title}"?\n\nThis will immediately remove all ${fileCount} photo${fileCount !== 1 ? 's' : ''} from storage. This cannot be undone.`
    )) return

    setPurgingG(galleryId)
    try {
      const res  = await fetch(`/api/admin/gallery-trash/${galleryId}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { alert(`Purge failed: ${body.error ?? 'Unknown error'}`); return }
      setGData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== galleryId), total: prev.total - 1 }
        : prev
      )
    } catch {
      alert('Network error â€” please try again.')
    } finally {
      setPurgingG('')
    }
  }

  const isFileLoading    = activeTab === 'FILES'     && loading
  const isGalleryLoading = activeTab === 'GALLERIES' && gLoading

  return (
    <div className="space-y-6">
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600/20 border border-red-600/30 rounded-xl">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Trash</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Files and galleries are permanently purged 30 days after deletion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'FILES' && data && (
            <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700
                             px-3 py-1.5 rounded-lg">
              {data.total} file{data.total !== 1 ? 's' : ''} in trash
            </span>
          )}
          {activeTab === 'GALLERIES' && gData && (
            <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700
                             px-3 py-1.5 rounded-lg">
              {gData.total} {gData.total === 1 ? 'gallery' : 'galleries'} in trash
            </span>
          )}

          {/* Sort control */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            {activeTab === 'FILES' ? (
              <select
                value={fileSort}
                onChange={e => { setFileSort(e.target.value as typeof fileSort); setPage(1) }}
                className="text-xs bg-slate-800 border border-slate-700 text-slate-300
                           rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1
                           focus:ring-indigo-500/60 cursor-pointer"
              >
                <option value="purge_asc">Purge date ↑</option>
                <option value="purge_desc">Purge date ↓</option>
                <option value="deleted_asc">Deleted date ↑</option>
                <option value="deleted_desc">Deleted date ↓</option>
              </select>
            ) : (
              <select
                value={galSort}
                onChange={e => { setGalSort(e.target.value as typeof galSort); setGPage(1) }}
                className="text-xs bg-slate-800 border border-slate-700 text-slate-300
                           rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1
                           focus:ring-indigo-500/60 cursor-pointer"
              >
                <option value="deleted_desc">Deleted date ↓</option>
                <option value="deleted_asc">Deleted date ↑</option>
                <option value="purge_asc">Purge date ↑</option>
                <option value="purge_desc">Purge date ↓</option>
              </select>
            )}
          </div>

          <button
            onClick={() => activeTab === 'FILES' ? fetchTrash(page, fileSort) : fetchGalleryTrash(gPage, galSort)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFileLoading || isGalleryLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex gap-1 bg-slate-800/60 border border-slate-700/60 rounded-xl p-1 w-fit">
        {(['FILES', 'GALLERIES'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {tab === 'FILES'
              ? <FileImage         className="w-3.5 h-3.5" />
              : <GalleryHorizontal className="w-3.5 h-3.5" />
            }
            {tab === 'FILES' ? 'Files' : 'Galleries'}
            {tab === 'FILES' && data && data.total > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md
                ${activeTab === 'FILES' ? 'bg-slate-600 text-slate-300' : 'bg-slate-700/60 text-slate-500'}`}>
                {data.total}
              </span>
            )}
            {tab === 'GALLERIES' && gData && gData.total > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md
                ${activeTab === 'GALLERIES' ? 'bg-slate-600 text-slate-300' : 'bg-slate-700/60 text-slate-500'}`}>
                {gData.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* â”€â”€ Info banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20
                      rounded-2xl px-4 py-3 text-sm text-amber-300/80">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Only admins can view this page. Deleted {activeTab === 'FILES' ? 'files' : 'galleries'} remain
          recoverable until their purge date. After purge, all R2 objects are permanently
          destroyed â€” this action cannot be undone.
          Activity log entries are retained&nbsp;indefinitely regardless of status.
        </span>
      </div>

      {/* â•â• FILES TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'FILES' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading trashâ€¦
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <XCircle className="w-10 h-10 text-red-500/60" />
              <p className="text-base font-medium text-red-400">Failed to load trash</p>
              <p className="text-sm text-slate-500 max-w-sm">{fetchError}</p>
              <button
                onClick={() => fetchTrash(page)}
                className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-800
                           border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
              >
                Try again
              </button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <Trash2 className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-base font-medium">Trash is empty</p>
              <p className="text-sm mt-1">No files have been soft-deleted.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.items.map(entry => {
                const file        = entry.mediaFile
                const days        = daysRemaining(entry.scheduledPurgeAt)
                const isUrgent    = days <= 3
                const isRestoring = restoring === entry.id
                const isPurging   = purging   === entry.id
                const isBusy      = isRestoring || isPurging

                return (
                  <div
                    key={entry.id}
                    className={`bg-slate-900/60 border rounded-2xl p-4 transition
                      ${isUrgent
                        ? 'border-red-800/40 shadow-sm shadow-red-950/30'
                        : 'border-slate-800/60'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* â”€â”€ File info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-xl shrink-0
                          ${file.fileType === 'VIDEO'
                            ? 'bg-violet-500/15 border border-violet-500/20'
                            : 'bg-sky-500/15 border border-sky-500/20'
                          }`}
                        >
                          {file.fileType === 'VIDEO'
                            ? <FileVideo  className="w-4 h-4 text-violet-400" />
                            : <FileImage  className="w-4 h-4 text-sky-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">
                            {file.originalName}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            {file.event && (
                              <span className="text-xs text-indigo-400">
                                {file.event.name}
                                {file.subfolder ? ` / ${file.subfolder.label}` : ''}
                              </span>
                            )}
                            <span className="text-xs text-slate-500">{formatSize(file.fileSize)}</span>
                            <span className="text-xs text-slate-600">
                              Was: <span className="text-slate-400">{entry.preDeleteStatus}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* â”€â”€ Right: badges + actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                                          text-xs font-medium border ${urgencyClass(entry.scheduledPurgeAt)}`}>
                          {isUrgent
                            ? <AlertTriangle className="w-3.5 h-3.5" />
                            : <Clock         className="w-3.5 h-3.5" />
                          }
                          {purgeLabel(entry.scheduledPurgeAt)}
                        </span>

                        <button
                          onClick={() => handleRestore(entry.id, file.originalName)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                     font-medium bg-emerald-600/20 text-emerald-300 border
                                     border-emerald-600/30 hover:bg-emerald-600/40 transition
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRestoring
                            ? <Loader2    className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw  className="w-3.5 h-3.5" />
                          }
                          {isRestoring ? 'Restoringâ€¦' : 'Restore'}
                        </button>

                        <button
                          onClick={() => handlePurge(entry.id, file.originalName)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                     font-medium bg-red-600/20 text-red-400 border
                                     border-red-600/30 hover:bg-red-600/40 transition
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPurging
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2  className="w-3.5 h-3.5" />
                          }
                          {isPurging ? 'Deletingâ€¦' : 'Delete Permanently'}
                        </button>
                      </div>
                    </div>

                    {/* â”€â”€ Footer: deletion metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60
                                    flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        Deleted by{' '}
                        <span className="text-slate-400">
                          {entry.deletedBy.username ?? entry.deletedBy.email}
                        </span>
                        {' '}on{' '}
                        <span className="text-slate-500">{formatDate(entry.deletedAt)}</span>
                      </span>
                      <span className={isUrgent ? 'text-red-500' : ''}>
                        Purge scheduled{' '}
                        <span className={isUrgent ? 'text-red-400 font-medium' : 'text-slate-500'}>
                          {formatDate(entry.scheduledPurgeAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                           border border-slate-700 hover:bg-slate-700
                           disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                â† Prev
              </button>
              <span className="text-xs text-slate-500">
                Page {data.page} of {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages || loading}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                           border border-slate-700 hover:bg-slate-700
                           disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next â†’
              </button>
            </div>
          )}

          {/* â”€â”€ Cron info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="flex items-start gap-2 text-xs text-slate-600 pt-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Automated purge runs daily via{' '}
              <code className="font-mono text-slate-500">GET /api/cron/purge</code>.
              Secure with the <code className="font-mono text-slate-500">CRON_SECRET</code> environment variable.
            </span>
          </div>
        </>
      )}

      {/* â•â• GALLERIES TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'GALLERIES' && (
        <>
          {gLoading ? (
            <div className="flex items-center justify-center py-24 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading gallery trashâ€¦
            </div>
          ) : gError ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <XCircle className="w-10 h-10 text-red-500/60" />
              <p className="text-base font-medium text-red-400">Failed to load gallery trash</p>
              <p className="text-sm text-slate-500 max-w-sm">{gError}</p>
              <button
                onClick={() => fetchGalleryTrash(gPage)}
                className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-800
                           border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
              >
                Try again
              </button>
            </div>
          ) : !gData || gData.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <GalleryHorizontal className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-base font-medium">Gallery trash is empty</p>
              <p className="text-sm mt-1">No galleries have been deleted.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gData.items.map(item => {
                const days        = daysRemaining(item.purgesAt)
                const isUrgent    = days <= 3
                const isRestoring = restoringG === item.id
                const isPurging   = purgingG   === item.id
                const isBusy      = isRestoring || isPurging

                return (
                  <div
                    key={item.id}
                    className={`bg-slate-900/60 border rounded-2xl p-4 transition
                      ${isUrgent
                        ? 'border-red-800/40 shadow-sm shadow-red-950/30'
                        : 'border-slate-800/60'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* â”€â”€ Gallery info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Cover thumbnail */}
                        <div className="w-16 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                          {item.coverUrl
                            ? <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center">
                                <GalleryHorizontal className="w-5 h-5 text-slate-600" />
                              </div>
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm truncate">{item.title}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            {item.categoryName && (
                              <span className="text-xs text-indigo-400">{item.categoryName} Â· {item.year}</span>
                            )}
                            <span className="text-xs text-slate-500">
                              {item.fileCount} photo{item.fileCount !== 1 ? 's' : ''}
                            </span>
                            {item.preDeleteStatus && (
                              <span className="text-xs text-slate-600">
                                Was: <span className="text-slate-400">{item.preDeleteStatus}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* â”€â”€ Right: badges + actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                                          text-xs font-medium border ${urgencyClass(item.purgesAt)}`}>
                          {isUrgent
                            ? <AlertTriangle className="w-3.5 h-3.5" />
                            : <Clock         className="w-3.5 h-3.5" />
                          }
                          {purgeLabel(item.purgesAt)}
                        </span>

                        <button
                          onClick={() => handleRestoreGallery(item.id, item.title)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                     font-medium bg-emerald-600/20 text-emerald-300 border
                                     border-emerald-600/30 hover:bg-emerald-600/40 transition
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRestoring
                            ? <Loader2   className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw className="w-3.5 h-3.5" />
                          }
                          {isRestoring ? 'Restoringâ€¦' : 'Restore'}
                        </button>

                        <button
                          onClick={() => handlePurgeGallery(item.id, item.title, item.fileCount)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                     font-medium bg-red-600/20 text-red-400 border
                                     border-red-600/30 hover:bg-red-600/40 transition
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPurging
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2  className="w-3.5 h-3.5" />
                          }
                          {isPurging ? 'Deletingâ€¦' : 'Delete Permanently'}
                        </button>
                      </div>
                    </div>

                    {/* â”€â”€ Footer: deletion metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60
                                    flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        Deleted by{' '}
                        <span className="text-slate-400">
                          {item.deletedBy.username ?? item.deletedBy.email}
                        </span>
                        {' '}on{' '}
                        <span className="text-slate-500">{formatDate(item.deletedAt)}</span>
                      </span>
                      <span className={isUrgent ? 'text-red-500' : ''}>
                        Purge scheduled{' '}
                        <span className={isUrgent ? 'text-red-400 font-medium' : 'text-slate-500'}>
                          {formatDate(item.purgesAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* â”€â”€ Pagination (galleries) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {gData && gData.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setGPage(p => Math.max(1, p - 1))}
                disabled={gPage === 1 || gLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                           border border-slate-700 hover:bg-slate-700
                           disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                â† Prev
              </button>
              <span className="text-xs text-slate-500">
                Page {gData.page} of {gData.pages}
              </span>
              <button
                onClick={() => setGPage(p => Math.min(gData.pages, p + 1))}
                disabled={gPage === gData.pages || gLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300
                           border border-slate-700 hover:bg-slate-700
                           disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next â†’
              </button>
            </div>
          )}

          {/* â”€â”€ Cron info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="flex items-start gap-2 text-xs text-slate-600 pt-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Gallery purge and 7-day warnings run daily at 3â€¯AM via{' '}
              <code className="font-mono text-slate-500">GET /api/cron/purge-galleries</code>.
              Warnings are sent to the admin who deleted the gallery.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
