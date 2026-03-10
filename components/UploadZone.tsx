'use client'

import {
  useState, useRef, useCallback, useEffect, DragEvent,
} from 'react'
import {
  Upload, X, CheckCircle2, AlertCircle, Loader2, Film,
  Image as ImageIcon, FolderOpen, ChevronDown, RefreshCw,
  WifiOff, Camera, Video as VideoIcon, GalleryHorizontalEnd, Clock,
} from 'lucide-react'
import { queueUpload, getQueue, removeFromQueue, type QueuedUpload } from '@/lib/offlineQueue'

// ──────────────────────────── Constants ──────────────────────────────────────
const MULTIPART_THRESHOLD = 50 * 1024 * 1024  // 50 MB – files above this use multipart
const PART_SIZE           = 8  * 1024 * 1024  // 8 MB per part
const MAX_CONCURRENT      = 3
const RESUME_PFX          = 'cmms_resume_'

// ──────────────────────────── Types ──────────────────────────────────────────
export interface DestinationInfo {
  eventId:         string
  eventName:       string
  categoryName:    string
  year:            number
  subfolderId?:    string | null
  subfolderLabel?: string | null
  subfolders?:     { id: string; label: string }[]
}

export interface EventOption {
  id:          string
  name:        string
  date:        string
  category:    { name: string; year: { year: number } }
  subfolders:  { id: string; label: string }[]
}

type UploadStatus = 'pending' | 'starting' | 'uploading' | 'completing' | 'done' | 'error' | 'queued-offline'

interface UploadFile {
  uid:          string          // local-only ID
  file:         File
  status:       UploadStatus
  progress:     number          // 0–100
  storedName?:  string
  error?:       string
  mode?:        'simple' | 'multipart'
  totalParts?:  number
  doneParts?:   number
  resumeKey?:   string
}

interface ResumeState {
  r2Key:          string
  uploadId:       string
  originalName:   string
  fileSize:       number
  contentType:    string
  eventId:        string
  subfolderId?:   string
  partSize:       number
  totalParts:     number
  completedParts: { PartNumber: number; ETag: string }[]
}

// ──────────────────────────── Helpers ────────────────────────────────────────
function resumeKey(file: File) {
  return `${RESUME_PFX}${encodeURIComponent(file.name)}_${file.size}_${file.lastModified}`
}

function loadResume(file: File): ResumeState | null {
  try {
    const raw = localStorage.getItem(resumeKey(file))
    return raw ? (JSON.parse(raw) as ResumeState) : null
  } catch { return null }
}

function saveResume(file: File, state: ResumeState) {
  try { localStorage.setItem(resumeKey(file), JSON.stringify(state)) } catch {}
}

function clearResume(file: File) {
  try { localStorage.removeItem(resumeKey(file)) } catch {}
}

/** XHR-based PUT that reports upload progress. */
function xhrPut(
  url:         string,
  data:        Blob,
  contentType: string,
  onProgress:  (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load',  () => xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(data)
  })
}

/** Fetch a part and return its ETag. */
async function uploadPart(
  url: string, chunk: Blob,
): Promise<string> {
  const res = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body:    chunk,
  })
  if (!res.ok) throw new Error(`Part upload failed: HTTP ${res.status}`)
  const etag = res.headers.get('ETag') ?? res.headers.get('etag')
  if (!etag) throw new Error('R2 did not return ETag — check your bucket CORS (expose ETag header).')
  return etag.replace(/"/g, '') // strip surrounding quotes if present
}

function formatSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function isVideo(file: File) { return file.type.startsWith('video/') }

// ──────────────────────────── Sub-components ─────────────────────────────────
function FileRow({
  uf, onRemove,
}: { uf: UploadFile; onRemove: () => void }) {
  const Icon = isVideo(uf.file) ? Film : ImageIcon
  const pct  = uf.progress

  return (
    <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3.5 py-2.5">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-white truncate max-w-[260px]">{uf.file.name}</p>
          <span className="text-xs text-slate-500 shrink-0">{formatSize(uf.file.size)}</span>
        </div>

        {uf.storedName && uf.status !== 'error' && (
          <p className="text-xs text-slate-600 truncate mt-0.5">→ {uf.storedName}</p>
        )}

        {(uf.status === 'uploading' || uf.status === 'completing') && (
          <div className="mt-1.5 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {uf.status === 'error' && (
          <p className="text-xs text-red-400 mt-0.5 truncate">{uf.error}</p>
        )}
        {uf.status === 'queued-offline' && (
          <p className="text-xs text-amber-500 mt-0.5">Saved — will upload when online</p>
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0 w-16 text-right">
        {uf.status === 'pending' && (
          <span className="text-xs text-slate-500">Queued</span>
        )}
        {uf.status === 'starting' && (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin ml-auto" />
        )}
        {uf.status === 'uploading' && (
          <span className="text-xs text-indigo-400 font-medium">{pct}%</span>
        )}
        {uf.status === 'completing' && (
          <span className="text-xs text-violet-400">Saving…</span>
        )}
        {uf.status === 'done' && (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
        )}
        {uf.status === 'error' && (
          <AlertCircle className="w-4 h-4 text-red-400 ml-auto" />
        )}
        {uf.status === 'queued-offline' && (
          <Clock className="w-4 h-4 text-amber-400 ml-auto" />
        )}
      </div>

      {/* Remove button (only when not uploading/queued) */}
      {uf.status !== 'uploading' && uf.status !== 'starting' && uf.status !== 'completing' && uf.status !== 'queued-offline' && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-700
                     transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ──────────────────────────── Main component ─────────────────────────────────
interface Props {
  defaultDestination?: DestinationInfo | null
  events:              EventOption[]
}

export function UploadZone({ defaultDestination, events }: Props) {
  const inputRef                        = useRef<HTMLInputElement>(null)
  const cameraRef                       = useRef<HTMLInputElement>(null)
  const videoRef                        = useRef<HTMLInputElement>(null)
  const galleryRef                      = useRef<HTMLInputElement>(null)
  const filesRef                        = useRef<UploadFile[]>([])
  const [filesState, setFilesState]     = useState<UploadFile[]>([])
  const [isDragging, setIsDragging]     = useState(false)
  const [destination, setDestination]   = useState<DestinationInfo | null>(
    defaultDestination ?? null,
  )
  const [selEventId,  setSelEventId]    = useState('')
  const [selSubId,    setSelSubId]      = useState('')
  const [isUploading, setIsUploading]   = useState(false)
  const [isOnline,    setIsOnline]      = useState(true)

  // Keep destination state in sync with the prop (for SSR-hydrated page)
  useEffect(() => {
    if (defaultDestination) setDestination(defaultDestination)
  }, [defaultDestination])

  // ── Online / offline detection ──────────────────────────────────────────────
  useEffect(() => {
    // Initialise from navigator at mount (client-only)
    setIsOnline(navigator.onLine)

    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Warn before unload / close tab when uploads are in progress ─────────────
  useEffect(() => {
    const hasActive = filesState.some(f =>
      ['pending', 'starting', 'uploading', 'completing'].includes(f.status)
    )
    if (!hasActive) return

    const handler = (e: BeforeUnloadEvent) => {
      // Standard way to show native browser "leave site?" dialog
      e.preventDefault()
      // Older browsers also need returnValue set (any non-empty string)
      e.returnValue = 'You have uploads in progress. If you leave, they will be lost. Are you sure?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [filesState])

  // ── SW message: drain offline queue when connectivity is restored ───────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OFFLINE_QUEUE_DRAIN') {
        drainOfflineQueue()
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  // ── Register background sync when coming back online ───────────────────────
  useEffect(() => {
    if (!isOnline) return

    // Auto-retry files that errored during a mid-upload connection drop
    if (filesRef.current.some(f => f.status === 'error')) uploadAll()

    // Try Background Sync (Chrome/Android) — gracefully ignores on iOS/Firefox
    navigator.serviceWorker?.ready.then(reg => {
      ;(reg as any).sync?.register('cmms-upload-sync').catch(() => {
        // Background Sync not supported — drain directly
        drainOfflineQueue()
      })
    }).catch(() => {
      drainOfflineQueue()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  // ── File state helpers ──────────────────────────────────────────────────────
  function syncState() { setFilesState([...filesRef.current]) }

  function updateFile(uid: string, patch: Partial<UploadFile>) {
    filesRef.current = filesRef.current.map(f =>
      f.uid === uid ? { ...f, ...patch } : f,
    )
    syncState()
  }

  function addFiles(incoming: File[]) {
    const news: UploadFile[] = incoming.map(file => ({
      uid:       crypto.randomUUID(),
      file,
      status:    'pending',
      progress:  0,
      resumeKey: resumeKey(file),
    }))
    filesRef.current = [...filesRef.current, ...news]
    syncState()
  }

  function removeFile(uid: string) {
    filesRef.current = filesRef.current.filter(f => f.uid !== uid)
    syncState()
  }

  // ── Drain offline queue ─────────────────────────────────────────────────────
  // Called when the device comes back online. Retrieves all queued items from
  // IndexedDB, adds them to the UI as pending files, and kicks off an upload.
  async function drainOfflineQueue() {
    if (!navigator.onLine) return
    let queued: QueuedUpload[]
    try { queued = await getQueue() } catch { return }
    if (!queued.length) return

    const restored: UploadFile[] = queued.map(q => ({
      uid:      q.uid,
      file:     new File([q.blob], q.originalName, { type: q.contentType }),
      status:   'pending' as UploadStatus,
      progress: 0,
    }))

    // Merge into queue (skip if already present)
    const existing = new Set(filesRef.current.map(f => f.uid))
    const newFiles = restored.filter(f => !existing.has(f.uid))
    if (!newFiles.length) return
    filesRef.current = [...filesRef.current, ...newFiles]
    syncState()

    // Remove from IndexedDB so they won't be re-added on next reconnect
    await Promise.allSettled(queued.map(q => removeFromQueue(q.uid)))

    // If we have a destination, start uploading immediately
    if (destination) uploadAll()
  }

  // ── Destination helpers ─────────────────────────────────────────────────────
  const selectedEvent = events.find(e => e.id === selEventId)

  function applyEventSelection() {
    if (!selectedEvent) return
    setDestination({
      eventId:         selectedEvent.id,
      eventName:       selectedEvent.name,
      categoryName:    selectedEvent.category.name,
      year:            selectedEvent.category.year.year,
      subfolderId:     selSubId || null,
      subfolderLabel:  selectedEvent.subfolders.find(s => s.id === selSubId)?.label ?? null,
      subfolders:      selectedEvent.subfolders,
    })
  }

  // ── Upload engine ───────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (uid: string) => {
    const uf = filesRef.current.find(f => f.uid === uid)
    if (!uf || uf.status !== 'pending') return
    if (!destination) return

    const { file }    = uf
    const contentType = file.type || 'application/octet-stream'
    const isMultipart = file.size >= MULTIPART_THRESHOLD

    updateFile(uid, { status: 'starting' })

    // ── Offline guard — save to IndexedDB queue and bail ───────────────────
    if (!navigator.onLine) {
      try {
        await queueUpload({
          uid,
          blob:         file,
          originalName: file.name,
          contentType,
          fileSize:     file.size,
          eventId:      destination.eventId,
          subfolderId:  destination.subfolderId,
          addedAt:      new Date().toISOString(),
        })
      } catch { /* storage full or private-mode — fall through to error */ }
      updateFile(uid, { status: 'queued-offline', progress: 0 })
      return
    }

    try {
      if (!isMultipart) {
        // ── SIMPLE PATH ────────────────────────────────────────────────────────
        const presignRes = await fetch('/api/upload/presign', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            filename:    file.name,
            contentType,
            fileSize:    file.size,
            eventId:     destination.eventId,
            subfolderId: destination.subfolderId,
          }),
        })
        if (!presignRes.ok) throw new Error((await presignRes.json()).error)
        const { uploadUrl, r2Key } = await presignRes.json()

        updateFile(uid, { status: 'uploading', mode: 'simple' })

        await xhrPut(uploadUrl, file, contentType, pct =>
          updateFile(uid, { progress: pct }),
        )

        updateFile(uid, { status: 'completing', progress: 100 })

        const regRes = await fetch('/api/upload/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            r2Key,
            originalName: file.name,
            contentType,
            fileSize:     file.size,
            eventId:      destination.eventId,
            subfolderId:  destination.subfolderId,
          }),
        })
        if (!regRes.ok) throw new Error((await regRes.json()).error)
        const { mediaFile: regMf } = await regRes.json()

        updateFile(uid, { status: 'done', progress: 100, storedName: regMf?.storedName })

      } else {
        // ── MULTIPART PATH ─────────────────────────────────────────────────────
        let resume = loadResume(file)
        let r2Key: string, uploadId: string
        let totalParts: number, completedParts: { PartNumber: number; ETag: string }[]
        let startFromPart: number

        if (resume && resume.eventId === destination.eventId) {
          // Resume
          ;({ r2Key, uploadId, totalParts, completedParts } = resume)
          startFromPart = completedParts.length + 1
          updateFile(uid, {
            status:     'uploading',
            mode:       'multipart',
            totalParts,
            doneParts:  completedParts.length,
            progress:   Math.round((completedParts.length / totalParts) * 100),
          })
        } else {
          // Fresh start
          const presignRes = await fetch('/api/upload/presign', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              filename:    file.name,
              contentType,
              fileSize:    file.size,
              eventId:     destination.eventId,
              subfolderId: destination.subfolderId,
            }),
          })
          if (!presignRes.ok) throw new Error((await presignRes.json()).error)
          const data = await presignRes.json()
          ;({ r2Key, uploadId, totalParts } = data)
          completedParts = []
          startFromPart  = 1

          resume = {
            r2Key, uploadId,
            originalName: file.name,
            fileSize:     file.size,
            contentType,
            eventId:      destination.eventId,
            subfolderId:  destination.subfolderId ?? undefined,
            partSize:     PART_SIZE,
            totalParts,
            completedParts,
          }
          saveResume(file, resume)
          updateFile(uid, {
            status: 'uploading', mode: 'multipart',
            totalParts, doneParts: 0, progress: 0,
          })
        }

        // Upload each remaining part
        for (let part = startFromPart; part <= totalParts; part++) {
          const start = (part - 1) * PART_SIZE
          const chunk = file.slice(start, start + PART_SIZE)

          // Get presigned URL for this part
          const partRes = await fetch('/api/upload/multipart', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'part', r2Key, uploadId, partNumber: part }),
          })
          if (!partRes.ok) throw new Error((await partRes.json()).error)
          const { url } = await partRes.json()

          const etag = await uploadPart(url, chunk)
          completedParts.push({ PartNumber: part, ETag: etag })

          // Persist resume state after each part
          resume!.completedParts = completedParts
          saveResume(file, resume!)

          const doneParts = completedParts.length
          updateFile(uid, {
            doneParts,
            progress: Math.round((doneParts / totalParts) * 100),
          })
        }

        // Complete the multipart upload
        updateFile(uid, { status: 'completing', progress: 99 })

        const completeRes = await fetch('/api/upload/multipart', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            action: 'complete',
            r2Key,   uploadId,   parts: completedParts,
            originalName: file.name,
            fileType:     file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO',
            fileSize:     file.size,
            eventId:      destination.eventId,
            subfolderId:  destination.subfolderId,
          }),
        })
        if (!completeRes.ok) throw new Error((await completeRes.json()).error)
        const { mediaFile: completeMf } = await completeRes.json()

        clearResume(file)
        updateFile(uid, { status: 'done', progress: 100, storedName: completeMf?.storedName })
      }
    } catch (err: any) {
      updateFile(uid, { status: 'error', error: err.message ?? 'Upload failed' })
    }
  }, [destination])

  // ── Run queue with concurrency cap ─────────────────────────────────────────
  async function uploadAll() {
    if (!destination || isUploading) return
    const pending = filesRef.current.filter(f =>
      f.status === 'pending' || f.status === 'error' ||
      (f.status === 'queued-offline' && navigator.onLine),
    )
    if (!pending.length) return

    // Reset error'd / queued-offline files to pending
    pending
      .filter(f => f.status === 'error' || f.status === 'queued-offline')
      .forEach(f => updateFile(f.uid, { status: 'pending', progress: 0, error: undefined }))

    setIsUploading(true)
    // Process in batches of MAX_CONCURRENT
    const uids = pending.map(f => f.uid)
    for (let i = 0; i < uids.length; i += MAX_CONCURRENT) {
      await Promise.all(uids.slice(i, i + MAX_CONCURRENT).map(id => uploadFile(id)))
    }
    setIsUploading(false)
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────
  function onDragOver(e: DragEvent) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave()            { setIsDragging(false) }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const pendingCount  = filesState.filter(f => f.status === 'pending').length
  const errorCount    = filesState.filter(f => f.status === 'error').length
  const doneCount     = filesState.filter(f => f.status === 'done').length
  const offlineCount  = filesState.filter(f => f.status === 'queued-offline').length
  const activeCount   = filesState.filter(f =>
    f.status === 'uploading' || f.status === 'starting' || f.status === 'completing',
  ).length
  const uploadableCount = pendingCount + errorCount + (isOnline ? offlineCount : 0)

  // ── Grouped event options ──────────────────────────────────────────────────
  const yearMap = new Map<number, EventOption[]>()
  for (const ev of events) {
    const yr = ev.category.year.year
    if (!yearMap.has(yr)) yearMap.set(yr, [])
    yearMap.get(yr)!.push(ev)
  }
  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a)

  return (
    <div className="space-y-5">

      {/* ── Offline banner ─────────────────────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center gap-3 bg-amber-950/60 border border-amber-800/50
                        rounded-xl px-4 py-3">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">You're offline</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Files will be queued and uploaded automatically when your connection returns.
            </p>
          </div>
          {offlineCount > 0 && (
            <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400
                             px-2 py-1 rounded-full">
              {offlineCount} queued
            </span>
          )}
        </div>
      )}

      {/* ── Drop zone ────────────────────────────────────────────────────── */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all
                    flex flex-col items-center justify-center py-14 gap-3
                    ${isDragging
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-slate-700 hover:border-slate-500 bg-slate-900/40 text-slate-400 hover:text-slate-300'
                    }`}
      >
        <div className={`p-3 rounded-xl border transition
          ${isDragging ? 'border-indigo-500/60 bg-indigo-500/20' : 'border-slate-700 bg-slate-800'}`}
        >
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-center">
          <p className="font-medium text-sm">
            {isDragging ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            Photos (JPEG, PNG, RAW, HEIC) · Videos (MP4, MOV, MKV)
          </p>
          <p className="text-xs text-slate-700 mt-0.5">
            Files ≥ 50 MB upload in resumable multipart chunks
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.dng,.raw,.cr2,.nef,.arw,.orf"
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)) }}
      />

      {/* Hidden capture inputs (mobile only) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)) }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)) }}
      />
      <input
        ref={galleryRef}
        type="file"
        multiple
        accept="image/*,video/*,.dng,.raw,.cr2,.nef,.arw,.orf"
        className="hidden"
        onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)) }}
      />

      {/* ── Mobile capture buttons (shown only on touch devices) ─────────── */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                     border border-slate-700 bg-slate-900/40 text-slate-400
                     hover:border-slate-500 hover:text-slate-300 active:bg-slate-800 transition"
        >
          <Camera className="w-5 h-5" />
          <span className="text-xs font-medium">Take Photo</span>
        </button>
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                     border border-slate-700 bg-slate-900/40 text-slate-400
                     hover:border-slate-500 hover:text-slate-300 active:bg-slate-800 transition"
        >
          <VideoIcon className="w-5 h-5" />
          <span className="text-xs font-medium">Record Video</span>
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl
                     border border-slate-700 bg-slate-900/40 text-slate-400
                     hover:border-slate-500 hover:text-slate-300 active:bg-slate-800 transition"
        >
          <GalleryHorizontalEnd className="w-5 h-5" />
          <span className="text-xs font-medium">Gallery</span>
        </button>
      </div>

      {/* ── Destination selector (only when not pre-filled) ──────────────── */}
      {!defaultDestination && (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Upload Destination
          </p>

          {destination ? (
            <div className="flex items-center gap-3">
              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {destination.year} · {destination.categoryName} · {destination.eventName}
                </p>
                {destination.subfolderLabel && (
                  <p className="text-xs text-slate-500">{destination.subfolderLabel}</p>
                )}
              </div>
              <button
                onClick={() => setDestination(null)}
                className="text-xs text-slate-500 hover:text-white transition underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <select
                  value={selEventId}
                  onChange={e => { setSelEventId(e.target.value); setSelSubId('') }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl
                             px-3 py-2 text-sm text-white focus:outline-none focus:ring-2
                             focus:ring-indigo-500"
                >
                  <option value="">— Select an event —</option>
                  {sortedYears.map(yr => (
                    <optgroup key={yr} label={String(yr)}>
                      {yearMap.get(yr)!.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {selectedEvent && selectedEvent.subfolders.length > 0 && (
                <div className="sm:w-48">
                  <select
                    value={selSubId}
                    onChange={e => setSelSubId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl
                               px-3 py-2 text-sm text-white focus:outline-none focus:ring-2
                               focus:ring-indigo-500"
                  >
                    <option value="">No subfolder</option>
                    {selectedEvent.subfolders.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={applyEventSelection}
                disabled={!selEventId}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white
                           bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                           disabled:cursor-not-allowed transition shrink-0"
              >
                Set destination
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Pre-filled destination banner ────────────────────────────────── */}
      {defaultDestination && (
        <div className="flex items-center gap-2.5 bg-indigo-950/60 border border-indigo-800/40
                        rounded-xl px-4 py-2.5">
          <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <span className="text-slate-400">{defaultDestination.year} · </span>
            <span className="text-slate-400">{defaultDestination.categoryName} · </span>
            <span className="text-white font-medium">{defaultDestination.eventName}</span>
            {defaultDestination.subfolderLabel && (
              <span className="text-slate-500"> / {defaultDestination.subfolderLabel}</span>
            )}
          </div>
        </div>
      )}

      {/* ── File queue ─────────────────────────────────────────────────────── */}
      {filesState.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {filesState.length} file{filesState.length !== 1 ? 's' : ''} queued
            </p>
            {doneCount > 0 && (
              <button
                onClick={() => {
                  filesRef.current = filesRef.current.filter(f => f.status !== 'done')
                  syncState()
                }}
                className="text-xs text-slate-500 hover:text-white transition"
              >
                Clear done
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {filesState.map(uf => (
              <FileRow
                key={uf.uid}
                uf={uf}
                onRemove={() => removeFile(uf.uid)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Upload / retry button ─────────────────────────────────────────── */}
      {filesState.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={uploadAll}
            disabled={
              uploadableCount === 0 ||
              isUploading ||
              (!destination)
            }
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                       text-sm font-semibold text-white transition
                       bg-gradient-to-r from-indigo-600 to-violet-600
                       hover:from-indigo-500 hover:to-violet-500
                       disabled:opacity-40 disabled:cursor-not-allowed
                       shadow shadow-indigo-500/20"
          >
            {isUploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : uploadableCount > 0
                ? <><Upload className="w-4 h-4" />
                    Upload {uploadableCount} file{uploadableCount !== 1 ? 's' : ''}
                    {errorCount > 0 ? ' (incl. retries)' : ''}</>
                : <><RefreshCw className="w-4 h-4" /> All done</>
            }
          </button>

          {!destination && (
            <p className="text-xs text-amber-500">Select a destination first</p>
          )}
        </div>
      )}

      {/* ── Active upload summary bar ─────────────────────────────────────── */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
          <span>Uploading {activeCount} file{activeCount !== 1 ? 's' : ''} concurrently…</span>
          <span className="ml-auto text-emerald-500">{doneCount} done</span>
        </div>
      )}
    </div>
  )
}
