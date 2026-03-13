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
import { runMultipartUpload, abortMultipartSession }                  from '@/lib/upload/multipart-uploader'

// ──────────────────────────── Constants ──────────────────────────────────────
const MULTIPART_THRESHOLD = 5  * 1024 * 1024  //  5 MB – files above this use multipart
const MAX_CONCURRENT      = 5                  // file-level concurrency; chunk concurrency = 4 (inside runMultipartUpload)
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
  speed?:       number   // bytes/sec (rolling)
  bytesLoaded?: number   // bytes uploaded so far
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

function formatSpeed(bps: number): string {
  if (bps < 1024)       return `${bps} B/s`
  if (bps < 1024 ** 2)  return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

function formatEta(bytesLeft: number, bps: number): string {
  if (bps <= 0 || bytesLeft <= 0) return '…'
  const secs = Math.round(bytesLeft / bps)
  if (secs < 60)  return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem  = secs % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

function isVideo(file: File) { return file.type.startsWith('video/') }

// ──────────────────────────── Sub-components ─────────────────────────────────
function FileRow({
  uf, onRemove, onRetry,
}: { uf: UploadFile; onRemove: () => void; onRetry: () => void }) {
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
          <div className="mt-1.5">
            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            {uf.status === 'uploading' && uf.speed && uf.speed > 0 && (
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-slate-600">{formatSpeed(uf.speed)}</span>
                <span className="text-[10px] text-slate-600">
                  ~{formatEta(uf.file.size - (uf.bytesLoaded ?? 0), uf.speed)} left
                </span>
              </div>
            )}
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

      {/* Per-file Retry button */}
      {uf.status === 'error' && (
        <button
          onClick={e => { e.stopPropagation(); onRetry() }}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                     font-medium text-indigo-400 hover:text-indigo-300
                     hover:bg-indigo-500/10 border border-indigo-500/30 transition"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}

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

        const startedAt = Date.now()
        await xhrPut(uploadUrl, file, contentType, pct => {
          const bytesLoaded = Math.round((pct / 100) * file.size)
          const elapsed     = (Date.now() - startedAt) / 1000
          const speed       = elapsed > 0.3 ? Math.round(bytesLoaded / elapsed) : undefined
          updateFile(uid, { progress: pct, bytesLoaded, speed })
        })

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
        // ── PARALLEL MULTIPART PATH ────────────────────────────────────────────
        // All chunk presigned-URLs are fetched in ONE server round-trip, then
        // PARALLEL_LIMIT (4) chunks upload simultaneously via XHR.
        // Result: a 500 MB video goes from ~15-20 min → ~2-3 min on 50 Mbps WiFi.
        const storedResume = loadResume(file)
        const hasResume    = !!(storedResume && storedResume.eventId === destination.eventId)

        updateFile(uid, {
          status:     'uploading',
          mode:       'multipart',
          totalParts: hasResume ? storedResume!.totalParts            : undefined,
          doneParts:  hasResume ? storedResume!.completedParts.length : 0,
          progress:   hasResume
            ? Math.round((storedResume!.completedParts.length / storedResume!.totalParts) * 100)
            : 0,
        })

        // Capture session IDs set in onCreate so we can abort on failure and
        // persist incremental resume state in onPartDone.
        let mpSession: { uploadId: string; key: string } | null = null
        const mpStartedAt = Date.now()

        try {
          const result = await runMultipartUpload({
            file,
            eventId:     destination.eventId,
            subfolderId: destination.subfolderId,

            resume: hasResume
              ? {
                  uploadId:       storedResume!.uploadId,
                  key:            storedResume!.r2Key,
                  completedParts: storedResume!.completedParts,
                }
              : undefined,

            // Called once after a fresh session is created (not called on resume).
            onCreate: ({ uploadId, key, totalParts }) => {
              mpSession = { uploadId, key }
              saveResume(file, {
                r2Key:          key,
                uploadId,
                originalName:   file.name,
                fileSize:       file.size,
                contentType,
                eventId:        destination.eventId,
                subfolderId:    destination.subfolderId ?? undefined,
                partSize:       10 * 1024 * 1024,
                totalParts,
                completedParts: [],
              })
              updateFile(uid, { totalParts })
            },

            // Called after every chunk — persist partial state for crash recovery.
            onPartDone: (completed, done, total) => {
              const s = mpSession ?? (
                hasResume ? { uploadId: storedResume!.uploadId, key: storedResume!.r2Key } : null
              )
              if (s) {
                saveResume(file, {
                  r2Key:          s.key,
                  uploadId:       s.uploadId,
                  originalName:   file.name,
                  fileSize:       file.size,
                  contentType,
                  eventId:        destination.eventId,
                  subfolderId:    destination.subfolderId ?? undefined,
                  partSize:       10 * 1024 * 1024,
                  totalParts:     total,
                  completedParts: completed,
                })
              }
              updateFile(uid, { doneParts: done })
            },

            onCompleting: () => updateFile(uid, { status: 'completing', progress: 99 }),
            onProgress: pct => {
              const bytesLoaded = Math.round((pct / 100) * file.size)
              const elapsed     = (Date.now() - mpStartedAt) / 1000
              const speed       = elapsed > 0.3 ? Math.round(bytesLoaded / elapsed) : undefined
              updateFile(uid, { progress: pct, bytesLoaded, speed })
            },
          })

          clearResume(file)
          updateFile(uid, { status: 'done', progress: 100, storedName: result.mediaFile.storedName })
        } catch (err: any) {
          // Abort the R2 session to free orphaned chunk data and avoid storage charges.
          const s = mpSession ?? (
            hasResume ? { uploadId: storedResume!.uploadId, key: storedResume!.r2Key } : null
          )
          if (s) void abortMultipartSession(s.uploadId, s.key)
          throw err  // re-throw so the outer catch sets the error UI state
        }
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
      .forEach(f => updateFile(f.uid, {
        status: 'pending', progress: 0, error: undefined,
        speed: undefined, bytesLoaded: undefined,
      }))

    setIsUploading(true)

    // True concurrent worker-pool — as soon as a file finishes, the worker
    // immediately grabs the next pending file (no gap-waiting from batching).
    const queue = pending.map(f => f.uid)
    let qi = 0

    async function worker() {
      while (qi < queue.length) {
        const uid = queue[qi++]  // atomic in single-threaded JS
        await uploadFile(uid)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker()),
    )
    setIsUploading(false)
  }

  // ── Per-file retry (re-queues a single failed file without touching others) ──
  async function retryFile(uid: string) {
    if (!destination) return
    updateFile(uid, {
      status: 'pending', progress: 0, error: undefined,
      speed: undefined, bytesLoaded: undefined,
    })
    await new Promise(r => setTimeout(r, 0))
    await uploadFile(uid)
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

  // Byte-weighted overall progress (accurate for mixed small/large files)
  const overallTotalBytes  = filesState.reduce((s, f) => s + f.file.size, 0)
  const overallLoadedBytes = filesState.reduce((s, f) => {
    if (f.status === 'done')                                   return s + f.file.size
    if (f.status === 'uploading' || f.status === 'completing') return s + (f.bytesLoaded ?? 0)
    return s
  }, 0)
  const overallPct         = overallTotalBytes > 0
    ? Math.round((overallLoadedBytes / overallTotalBytes) * 100)
    : 0
  // Sum speed of all concurrently uploading files
  const avgUploadSpeed = filesState
    .filter(f => f.status === 'uploading' && (f.speed ?? 0) > 0)
    .reduce((s, f) => s + (f.speed ?? 0), 0)
  // Remaining bytes across all in-flight + queued files
  const remainingBytes = filesState
    .filter(f => ['pending', 'starting', 'uploading', 'completing'].includes(f.status))
    .reduce((s, f) => s + f.file.size - (f.bytesLoaded ?? 0), 0)

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
            Files ≥ 5 MB upload in resumable parallel multipart chunks
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
            {doneCount > 0 && !isUploading && (
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

          {/* Overall progress bar — visible while uploads are in flight */}
          {isUploading && filesState.length > 1 && (
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Uploading{' '}
                  <span className="text-white font-semibold">{activeCount}</span>
                  {' '}of{' '}
                  <span className="text-white font-semibold">{filesState.length}</span>
                  {' '}files —{' '}
                  <span className="text-indigo-400 font-semibold">{overallPct}% complete</span>
                </span>
                {avgUploadSpeed > 0 && remainingBytes > 0 && (
                  <span className="text-slate-500 shrink-0 ml-3">
                    {formatSpeed(avgUploadSpeed)} · ~{formatEta(remainingBytes, avgUploadSpeed)} left
                  </span>
                )}
              </div>
              <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-600">
                <span>
                  {doneCount > 0 ? `${doneCount} done` : ''}
                  {doneCount > 0 && (pendingCount > 0 || errorCount > 0) ? ' · ' : ''}
                  {pendingCount > 0 ? `${pendingCount} queued` : ''}
                  {errorCount > 0 ? `${pendingCount > 0 ? ' · ' : ''}${errorCount} failed` : ''}
                </span>
                {doneCount > 0 && (
                  <button
                    onClick={() => {
                      filesRef.current = filesRef.current.filter(f => f.status !== 'done')
                      syncState()
                    }}
                    className="text-slate-500 hover:text-white transition"
                  >
                    Clear done
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {filesState.map(uf => (
              <FileRow
                key={uf.uid}
                uf={uf}
                onRemove={() => removeFile(uf.uid)}
                onRetry={() => retryFile(uf.uid)}
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


    </div>
  )
}
