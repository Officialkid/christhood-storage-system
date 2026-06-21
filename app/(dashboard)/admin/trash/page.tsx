'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Trash2, RotateCcw, Clock, AlertTriangle, Loader2,
  RefreshCw, ShieldAlert, FileImage, FileVideo, Info, XCircle,
  ArrowUpDown,
} from 'lucide-react'
import { TrashActionButton } from '@/components/admin/trash/TrashActionButton'
import {
  daysRemaining,
  urgencyClass,
  purgeLabel,
  formatTrashDate,
  formatTrashSize,
} from '@/components/admin/trash/trash-utils'
import { invalidateFileCache } from '@/lib/cache'
import { useToast } from '@/lib/toast'

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
const formatDate = formatTrashDate
const formatSize = formatTrashSize

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminTrashPage() {
  const toast = useToast()
  const [data,         setData]         = useState<PageData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState('')
  const [restoring,    setRestoring]    = useState<string>('')
  const [purging,      setPurging]      = useState<string>('')
  const [page,         setPage]         = useState(1)
  const activeTab = 'FILES' as const
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
    fetchTrash(page, fileSort)
  }, [page, fileSort])

  // â”€â”€ Restore file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleRestore(trashItemId: string, fileName: string) {
    if (!confirm(`Restore "${fileName}"? It will return to its previous status.`)) return

    setRestoring(trashItemId)
    try {
      const res = await fetch(`/api/admin/trash/${trashItemId}/restore`, { method: 'POST' })
      const body = await res.json()

      if (!res.ok) {
        toast.error(body.error ?? 'Failed to restore the file.')
        return
      }

      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== trashItemId), total: prev.total - 1 }
        : prev
      )
      void invalidateFileCache()
      toast.success(`"${fileName}" restored.`)
    } catch {
      toast.error('Network error while restoring the file. Please try again.')
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
        toast.error(body.error ?? 'Failed to permanently delete the file.')
        return
      }

      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== trashItemId), total: prev.total - 1 }
        : prev
      )
      toast.success(`"${fileName}" permanently deleted.`)
    } catch {
      toast.error('Network error while deleting the file. Please try again.')
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
      if (!res.ok) { toast.error(body.error ?? 'Failed to restore the gallery.'); return }
      setGData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== galleryId), total: prev.total - 1 }
        : prev
      )
      toast.success(`"${title}" restored.`)
    } catch {
      toast.error('Network error while restoring the gallery. Please try again.')
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
      if (!res.ok) { toast.error(body.error ?? 'Failed to permanently delete the gallery.'); return }
      setGData(prev => prev
        ? { ...prev, items: prev.items.filter(i => i.id !== galleryId), total: prev.total - 1 }
        : prev
      )
      toast.success(`"${title}" permanently deleted.`)
    } catch {
      toast.error('Network error while deleting the gallery. Please try again.')
    } finally {
      setPurgingG('')
    }
  }

  const isFileLoading = loading

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
              Deleted files are permanently purged 30 days after deletion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700
                             px-3 py-1.5 rounded-lg">
              {data.total} file{data.total !== 1 ? 's' : ''} in trash
            </span>
          )}

          {/* Sort control */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
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
          </div>

          <button
            onClick={() => fetchTrash(page, fileSort)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFileLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* â”€â”€ Info banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20
                      rounded-2xl px-4 py-3 text-sm text-amber-300/80">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Only admins can view this page. Deleted files remain
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

                        <TrashActionButton
                          onClick={() => handleRestore(entry.id, file.originalName)}
                          disabled={isBusy}
                          busy={isRestoring}
                          idleLabel="Restore"
                          busyLabel="Restoring…"
                          icon={<RotateCcw className="w-3.5 h-3.5" />}
                          tone="success"
                        />

                        <TrashActionButton
                          onClick={() => handlePurge(entry.id, file.originalName)}
                          disabled={isBusy}
                          busy={isPurging}
                          idleLabel="Delete Permanently"
                          busyLabel="Deleting…"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          tone="danger"
                        />
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

    </div>
  )
}
