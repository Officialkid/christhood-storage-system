'use client'

import {
  useState, useRef, useCallback, useEffect, DragEvent,
} from 'react'
import {
  Upload, X, CheckCircle2, AlertCircle, Loader2, Film,
  Image as ImageIcon, FolderOpen, ChevronDown, RefreshCw,
  WifiOff, Wifi, Camera, Video as VideoIcon, GalleryHorizontalEnd, Clock, PauseCircle,
} from 'lucide-react'
import { queueUpload, getQueue, removeFromQueue, type QueuedUpload } from '@/lib/offlineQueue'
import { runMultipartUpload, abortMultipartSession, NetworkError, DuplicateError }   from '@/lib/upload/multipart-uploader'
import { invalidateFileCache } from '@/lib/cache'
import {
  getSession, saveSession, updateSession, deleteSession,
  getActiveSessions, discardAllSessions, sessionIdFor, getSessionByFileName,
  type UploadSession,
} from '@/lib/upload/upload-session-store'
import {
  requestNotificationPermission, notifyUploadProgress,
  notifyUploadComplete, notifyUploadFailed, dismissUploadNotification,
} from '@/lib/upload/upload-notifications'
import DuplicateCheckDialog, {
  type DuplicateEntry, type DuplicateResolution,
} from './DuplicateCheckDialog'

// ──────────────────────────── Constants ──────────────────────────────────────
const MULTIPART_THRESHOLD = 10 * 1024 * 1024  // 10 MB – files above this use multipart (matches chunk size)
const MAX_CONCURRENT      = 5                  // file-level concurrency; chunk concurrency = 4 (inside runMultipartUpload)
// Throttle PWA notification updates: post to SW every NOTIF_THROTTLE_PCT % change
const NOTIF_THROTTLE_PCT  = 5

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

type UploadStatus = 'pending' | 'starting' | 'uploading' | 'completing' | 'done' | 'error' | 'queued-offline' | 'paused'

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
  sessionId?:   string          // stable IDB key = sessionIdFor(file)
  speed?:       number          // bytes/sec (rolling)
  bytesLoaded?: number          // bytes uploaded so far
  uploadMode?:  'small-queue' | 'large-chunks'  // strategy label shown in UI
  versionOf?:   string          // existing MediaFile ID — set when uploading as a new version
  versionNumber?: number        // returned by the server after version creation
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

/**
 * Resolve a reliable MIME type from the browser-supplied file.type and the
 * file extension. Browsers on iOS often return an empty string for .mov and
 * some .mp4 files, which causes the server to reject the upload with 415.
 * This must produce the same value that will be sent as the PUT Content-Type
 * header, because R2 validates the signature against that header exactly.
 */
function resolveMimeType(fileName: string, browserType: string): string {
  if (browserType && browserType.includes('/') && browserType !== 'application/octet-stream') {
    return browserType
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', heic: 'image/heic',
    heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    raw: 'image/x-raw', cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef',
    mp4: 'video/mp4',  mov: 'video/quicktime',   avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
    m4v: 'video/x-m4v',      wmv: 'video/x-ms-wmv',
  }
  return map[ext] ?? browserType ?? 'application/octet-stream'
}

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

        {/* Show the saved-as name only when a suffix was added (e.g. "IMG_6063 (1).jpg") */}
        {uf.storedName && uf.storedName !== uf.file.name && uf.status !== 'error' && (
          <p className="text-xs text-slate-500 truncate mt-0.5">→ saved as {uf.storedName}</p>
        )}

        {(uf.status === 'uploading' || uf.status === 'completing') && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            {uf.status === 'uploading' && (
              <div className="flex justify-between items-center mt-0.5">
                {/* Left: mode badge + speed once it's available */}
                <span className="text-[10px] text-slate-600 flex items-center gap-1">
                  {uf.uploadMode === 'small-queue' && (
                    <span className="text-emerald-600">⚡ fast queue</span>
                  )}
                  {uf.uploadMode === 'large-chunks' && (
                    <span className="text-violet-500">⎇ chunked</span>
                  )}
                  {uf.speed && uf.speed > 0 && (
                    <span>· {formatSpeed(uf.speed)}</span>
                  )}
                </span>
                {/* Right: ETA */}
                {uf.speed && uf.speed > 0 && (
                  <span className="text-[10px] text-slate-600">
                    ~{formatEta(uf.file.size - (uf.bytesLoaded ?? 0), uf.speed)} left
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {uf.status === 'error' && (
          <p className="text-xs text-red-400 mt-0.5 truncate">{uf.error}</p>
        )}
        {uf.status === 'paused' && (
          <p className="text-xs text-amber-400 mt-0.5">Paused — will resume when online ({uf.progress}% saved)</p>
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
          <div className="flex items-center gap-1 justify-end">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {uf.versionNumber && (
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/15 rounded px-1">
                v{uf.versionNumber}
              </span>
            )}
          </div>
        )}
        {uf.status === 'error' && (
          <AlertCircle className="w-4 h-4 text-red-400 ml-auto" />
        )}
        {uf.status === 'paused' && (
          <PauseCircle className="w-4 h-4 text-amber-400 ml-auto" />
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

      {/* Remove button — not shown while actively uploading or offline-queued */}
      {uf.status !== 'uploading' && uf.status !== 'starting' && uf.status !== 'completing'
        && uf.status !== 'queued-offline' && uf.status !== 'paused' && (
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
  const [isOnline,       setIsOnline]         = useState(true)
  // True for 5 s after a network drop reconnects while uploads were paused
  const [showRestoredBanner, setShowRestoredBanner] = useState(false)
  // Sessions from a previous page load that were interrupted mid-upload
  const [resumeSessions, setResumeSessions] = useState<import('@/lib/upload/upload-session-store').UploadSession[]>([])
  // Track last notification % to throttle SW messages
  const lastNotifPctRef  = useRef(-NOTIF_THROTTLE_PCT)
  // Adaptive chunk size — recalculated before each upload batch via /api/ping latency probe
  const chunkSizeRef     = useRef(10 * 1024 * 1024)
  // Duplicate-resolution dialog state (per-file, triggered during upload on 409)
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    filename:     string
    existingName: string
  } | null>(null)
  const duplicateResolveRef = useRef<((choice: 'replace' | 'keep-both' | 'cancel') => void) | null>(null)

  // Pre-upload batch duplicate check dialog
  const [dupCheckEntries, setDupCheckEntries] = useState<DuplicateEntry[] | null>(null)
  const dupCheckResolveRef = useRef<((r: DuplicateResolution[]) => void) | null>(null)

  // iOS device detection (set on mount, drives the keep-open banner)
  const [isIOS, setIsIOS] = useState(false)

  // In-app SPA navigation guard: holds pending URL when user tries to navigate mid-upload
  const [navGuard, setNavGuard] = useState<{ url: string } | null>(null)
  // Stores the proceed-with-navigation callback so "Leave anyway" can execute it
  const navProceedRef = useRef<(() => void) | null>(null)

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
      e.returnValue = 'You have uploads in progress. Your progress is saved and will resume when you return. Leave now?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [filesState])

  // ── iOS detection (client-only) ───────────────────────────────────────────
  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))
  }, [])

  // ── Register per-upload Background Sync tags when app is backgrounded ──────
  // On Android Chrome, Background Sync fires even if the PWA is not visible,
  // so we register a per-upload tag each time the user switches away. The SW
  // will then either message the (re-opened) window or show a "tap to resume"
  // notification when there is no window to message.
  // Tags use the R2 uploadId so the SW can look up the right session.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) return
      const active = filesRef.current.filter(f =>
        ['pending', 'starting', 'uploading', 'completing', 'paused'].includes(f.status),
      )
      if (active.length === 0) return
      void (async () => {
        try {
          const reg = await navigator.serviceWorker?.ready
          if (!reg) return
          const syncReg = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync
          if (!syncReg) return
          // Generic tag (also handles offline-queue drain)
          syncReg.register('resume-upload').catch(() => {})
          // Per-upload tags — resolve uploadId from IDB so the SW can look up the session
          for (const f of active) {
            let tag: string
            if (f.sessionId) {
              const session = await getSession(f.sessionId).catch(() => null)
              tag = session ? `resume-upload-${session.uploadId}` : `resume-upload-${f.uid}`
            } else {
              tag = `resume-upload-${f.uid}`
            }
            syncReg.register(tag).catch(() => {})
          }
        } catch { /* SW not ready or not supported */ }
      })()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // ── In-app SPA navigation guard ─────────────────────────────────────────────
  // Patches window.history.pushState while the component is mounted so that any
  // Next.js Link / router.push navigation is intercepted when uploads are active.
  // Shows a custom dialog; "Leave anyway" re-fires the original navigation.
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history)

    const guardedPush: typeof window.history.pushState = function (state, unused, url) {
      if (
        filesRef.current.some(f =>
          ['pending', 'starting', 'uploading', 'completing'].includes(f.status),
        )
      ) {
        const rawUrl = typeof url === 'string' ? url : (url?.toString() ?? '')
        // Only intercept actual page changes, not same-path query/hash updates
        try {
          const target = new URL(rawUrl, window.location.origin)
          if (target.pathname === window.location.pathname) {
            originalPushState(state, unused, url)
            return
          }
        } catch {
          // Malformed URL — let it through
          originalPushState(state, unused, url)
          return
        }
        navProceedRef.current = () => originalPushState(state, unused, url)
        setNavGuard({ url: rawUrl })
        return
      }
      originalPushState(state, unused, url)
    }

    window.history.pushState = guardedPush
    return () => { window.history.pushState = originalPushState }
  }, [])

  // ── SW message: drain offline queue / resume uploads ──────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OFFLINE_QUEUE_DRAIN') {
        drainOfflineQueue()
      }
      if (event.data?.type === 'RESUME_UPLOADS') {
        // Service worker signalled that we should resume any paused sessions
        const paused = filesRef.current.filter(f => f.status === 'paused')
        paused.forEach(f => {
          updateFile(f.uid, { status: 'pending', error: undefined })
          void uploadFile(f.uid)
        })
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  // ── Register background sync + resume paused uploads when coming back online
  useEffect(() => {
    if (!isOnline) return

    // Auto-resume files that were PAUSED by a network drop (preserve R2 session)
    const paused = filesRef.current.filter(f => f.status === 'paused')
    if (paused.length > 0) {
      setShowRestoredBanner(true)
      setTimeout(() => setShowRestoredBanner(false), 5000)
      paused.forEach(f => {
        updateFile(f.uid, { status: 'pending', error: undefined, speed: undefined })
        void uploadFile(f.uid)
      })
    }

    // Auto-retry files that errored during a mid-upload connection drop
    if (filesRef.current.some(f => f.status === 'error')) uploadAll()

    // Register Background Sync (Chrome/Android) — gracefully ignores on iOS/Firefox
    navigator.serviceWorker?.ready.then(reg => {
      ;(reg as any).sync?.register('cmms-upload-sync').catch(() => {
        drainOfflineQueue()
      })
      ;(reg as any).sync?.register('resume-upload').catch(() => {/* not supported */})
    }).catch(() => {
      drainOfflineQueue()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  // ── On mount: scan IDB for incomplete sessions from previous page loads ─────
  useEffect(() => {
    getActiveSessions().then(sessions => {
      if (sessions.length > 0) setResumeSessions(sessions)
    }).catch(() => {})

    // Dismiss any lingering upload notifications when the upload page is opened
    dismissUploadNotification()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      uid:        crypto.randomUUID(),
      file,
      status:     'pending',
      progress:   0,
      sessionId:  sessionIdFor(file),
      uploadMode: file.size >= MULTIPART_THRESHOLD
        ? 'large-chunks' as const
        : 'small-queue'  as const,
    }))
    filesRef.current = [...filesRef.current, ...news]
    syncState()
    // Remove any resume-banner entries that match files the user just added
    // (they'll auto-resume in uploadFile via IDB lookup)
    setResumeSessions(prev => prev.filter(
      s => !news.some(n => n.sessionId === s.sessionId),
    ))
    // Async fallback: if Android lastModified drift caused sessionIdFor(file) to
    // mismatch the stored sessionId, re-lookup by fileName+fileSize and patch
    // the UploadFile so uploadFile() finds the correct IDB session.
    void (async () => {
      for (const nf of news) {
        if (nf.file.size < MULTIPART_THRESHOLD) continue
        const exact = await getSession(nf.sessionId!)
        if (!exact) {
          const fuzzy = await getSessionByFileName(nf.file.name, nf.file.size)
          if (fuzzy) {
            filesRef.current = filesRef.current.map(f =>
              f.uid === nf.uid ? { ...f, sessionId: fuzzy.sessionId } : f,
            )
            syncState()
            setResumeSessions(prev => prev.filter(s => s.sessionId !== fuzzy.sessionId))
          }
        }
      }
    })()

    // ── Pre-upload duplicate check ─────────────────────────────────────────
    // Only run when a destination is already selected so we have an eventId.
    // Errors are silently swallowed — the upload never blocks on this check.
    if (destination) {
      const destSnapshot = destination   // capture for async closure
      void (async () => {
        try {
          const res = await fetch('/api/upload/check-duplicates', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              eventId: destSnapshot.eventId,
              files:   news.map(nf => ({ name: nf.file.name, size: nf.file.size })),
            }),
          })
          if (!res.ok) return
          const { results } = await res.json() as {
            results: { name: string; size: number; duplicate: DuplicateEntry['duplicate'] | null }[]
          }

          // Build list of files that have an existing match
          const entries: DuplicateEntry[] = results
            .filter(r => r.duplicate !== null)
            .map(r => {
              const uf = news.find(nf => nf.file.name === r.name)
              return { uid: uf!.uid, name: r.name, size: r.size, duplicate: r.duplicate! }
            })

          if (entries.length === 0) return   // nothing to resolve

          // Show dialog and wait for the user's per-file resolutions
          const resolutions = await new Promise<DuplicateResolution[]>(resolve => {
            dupCheckResolveRef.current = resolve
            setDupCheckEntries(entries)
          })

          // Apply resolutions to the queue
          for (const resolution of resolutions) {
            if (resolution.action === 'skip') {
              filesRef.current = filesRef.current.filter(f => f.uid !== resolution.uid)
            } else if (resolution.action === 'upload-as-version') {
              const entry = entries.find(e => e.uid === resolution.uid)
              if (entry) {
                filesRef.current = filesRef.current.map(f =>
                  f.uid === resolution.uid ? { ...f, versionOf: entry.duplicate.id } : f,
                )
              }
            }
            // 'upload-anyway': no change — file uploads normally as a new media file
          }
          syncState()
        } catch {
          // Silently ignore — never block uploads due to duplicate check errors
        }
      })()
    }
  }

  function removeFile(uid: string) {
    filesRef.current = filesRef.current.filter(f => f.uid !== uid)
    syncState()
  }

  /** Inserts a numeric suffix before the file extension: IMG.jpg → IMG (1).jpg */
  function addSuffix(filename: string, n: number): string {
    const dot = filename.lastIndexOf('.')
    return dot !== -1
      ? `${filename.slice(0, dot)} (${n})${filename.slice(dot)}`
      : `${filename} (${n})`
  }

  /** Pauses the upload and shows the duplicate-resolution dialog. */
  function askDuplicateAction(
    filename:     string,
    existingName: string,
  ): Promise<'replace' | 'keep-both' | 'cancel'> {
    return new Promise(resolve => {
      duplicateResolveRef.current = resolve
      setDuplicatePrompt({ filename, existingName })
    })
  }

  function handleDuplicateChoice(choice: 'replace' | 'keep-both' | 'cancel') {
    const resolve = duplicateResolveRef.current
    duplicateResolveRef.current = null
    setDuplicatePrompt(null)
    resolve?.(choice)
  }

  function handleDupCheckResolve(resolutions: DuplicateResolution[]) {
    setDupCheckEntries(null)
    dupCheckResolveRef.current?.(resolutions)
    dupCheckResolveRef.current = null
  }

  function handleDupCheckCancel() {
    const entries = dupCheckEntries ?? []
    setDupCheckEntries(null)
    // Treat cancel as "skip all" duplicates
    dupCheckResolveRef.current?.(entries.map(e => ({ uid: e.uid, action: 'skip' as const })))
    dupCheckResolveRef.current = null
  }

  // ── Navigation guard handlers ───────────────────────────────────────────────
  function handleNavStay() {
    setNavGuard(null)
    navProceedRef.current = null
  }

  function handleNavLeave() {
    const proceed = navProceedRef.current
    navProceedRef.current = null
    setNavGuard(null)
    proceed?.()
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
    // Resolve MIME type from file extension when file.type is empty (common on iOS
    // for .mov and some .mp4 files). This value is sent to the presign API AND used
    // as the PUT Content-Type header — they must be identical for R2 to accept the upload.
    const contentType = resolveMimeType(file.name, file.type)
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
        let effectiveFilename = file.name
        let uploadForce       = false
        let presignData: { uploadUrl: string; r2Key: string; mimeType?: string } | null = null

        {
          const firstRes = await fetch('/api/upload/presign', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              filename:    effectiveFilename,
              contentType,
              fileSize:    file.size,
              eventId:     destination.eventId,
              subfolderId: destination.subfolderId,
            }),
          })

          if (firstRes.status === 409) {
            const dupData = await firstRes.json()
            updateFile(uid, { status: 'paused', progress: 0, speed: undefined })
            const choice = await askDuplicateAction(effectiveFilename, dupData.existingName ?? effectiveFilename)
            updateFile(uid, { status: 'starting' })

            if (choice === 'cancel') {
              updateFile(uid, { status: 'error', error: 'Upload cancelled' })
              return
            }
            if (choice === 'replace') {
              uploadForce = true
            }
            if (choice === 'keep-both') {
              let found = false
              for (let n = 1; n <= 10; n++) {
                const candidate = addSuffix(file.name, n)
                const ckRes = await fetch('/api/upload/presign', {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({
                    filename:    candidate,
                    contentType,
                    fileSize:    file.size,
                    eventId:     destination.eventId,
                    subfolderId: destination.subfolderId,
                    checkOnly:   true,
                  }),
                })
                if (ckRes.status !== 409) { effectiveFilename = candidate; found = true; break }
              }
              if (!found) throw new Error('Could not find a unique filename — please rename the file and retry')
            }

            // Re-call presign with the resolved name / force flag
            const retryRes = await fetch('/api/upload/presign', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                filename:    effectiveFilename,
                contentType,
                fileSize:    file.size,
                eventId:     destination.eventId,
                subfolderId: destination.subfolderId,
                force:       uploadForce,
              }),
            })
            if (!retryRes.ok) throw new Error((await retryRes.json()).error)
            presignData = await retryRes.json()
          } else {
            if (!firstRes.ok) throw new Error((await firstRes.json()).error)
            presignData = await firstRes.json()
          }
        }

        const { uploadUrl, r2Key, mimeType: resolvedMimeType } = presignData!
        // Use the server-echoed mimeType for the PUT Content-Type header.
        // R2 validates that it matches the Content-Type embedded in the presigned
        // URL signature — using the server-returned value guarantees an exact match.
        const putContentType = resolvedMimeType ?? contentType

        updateFile(uid, { status: 'uploading', mode: 'simple' })

        const startedAt = Date.now()
        await xhrPut(uploadUrl, file, putContentType, pct => {
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
            originalName: effectiveFilename,
            contentType:  putContentType,
            fileSize:     file.size,
            eventId:      destination.eventId,
            subfolderId:  destination.subfolderId,
            force:        uploadForce,
            versionOf:    uf.versionOf ?? null,
          }),
        })
        if (!regRes.ok) throw new Error((await regRes.json()).error)
        const regData = await regRes.json()
        const versionNumber = regData.version?.versionNumber as number | undefined

        updateFile(uid, {
          status:        'done',
          progress:      100,
          storedName:    effectiveFilename !== file.name ? effectiveFilename : undefined,
          versionNumber: versionNumber,
        })

      } else {
        // ── PARALLEL MULTIPART PATH ──────────────────────────────────────────
        // 1. Batch-presign ALL part URLs in one round-trip.
        // 2. Upload with PARALLEL_LIMIT concurrent XHR requests.
        // 3. Persist progress to IDB after each chunk (survives page reload).
        // 4. NetworkError → pause (don't abort R2 session); reconnect auto-resumes.

        const sId = sessionIdFor(file)
        // Check IDB for an incomplete session — exact key first, then fuzzy by
        // fileName+fileSize. Android Chrome can drift file.lastModified between
        // picks so the exact key may miss an otherwise valid saved session.
        let storedSession = await getSession(sId)
        let effectiveSid  = sId
        if (!storedSession) {
          storedSession = await getSessionByFileName(file.name, file.size) ?? undefined
          if (storedSession) effectiveSid = storedSession.sessionId
        }
        // Resume whenever a session exists for this file — regardless of which event
        // is currently selected in the UI. The stored session carries its own eventId
        // used for the /complete call so the file always lands in the correct event.
        const hasResume = !!storedSession

        updateFile(uid, {
          status:     'uploading',
          mode:       'multipart',
          sessionId:  effectiveSid,
          totalParts: hasResume ? storedSession!.totalChunks              : undefined,
          doneParts:  hasResume ? storedSession!.completedParts.length    : 0,
          progress:   hasResume && storedSession!.totalChunks > 0
            ? Math.round((storedSession!.completedParts.length / storedSession!.totalChunks) * 100)
            : 0,
        })

        // Object property avoids TypeScript narrowing-to-never in catch blocks
        const mpCtx = { session: null as { uploadId: string; key: string } | null }
        let mpFilenameOverride: string | undefined = undefined
        let mpForce                                                      = false
        const mpStartedAt = Date.now()
        // Resumed uploads must reuse the original chunk size stored in IDB — the part
        // numbers and byte offsets were decided at session-creation time and can't change.
        const effectiveChunkSize = hasResume && storedSession?.chunkSize
          ? storedSession.chunkSize
          : chunkSizeRef.current

        // Build upload options (filename/force may be updated on duplicate retry)
        const makeMpOpts = () => ({
          file,
          // On resume: use the stored eventId so the file commits to its original
          // event even if the user currently has a different destination selected.
          eventId:     hasResume ? storedSession!.eventId              : destination.eventId,
          subfolderId: hasResume ? (storedSession!.subfolderId ?? null) : destination.subfolderId,
          filenameOverride: mpFilenameOverride,
          force:            mpForce,
          chunkSize:        effectiveChunkSize,
          versionOf:        uf.versionOf ?? undefined,

          resume: hasResume
            ? {
                uploadId:       storedSession!.uploadId,
                key:            storedSession!.key,
                completedParts: storedSession!.completedParts,
              }
            : undefined,

          // Fired once on fresh session creation — persist to IDB immediately.
          onCreate: ({ uploadId, key, totalParts }: { uploadId: string; key: string; totalParts: number }) => {
            mpCtx.session = { uploadId, key }
            void saveSession({
              sessionId:      effectiveSid,
              uploadId,
              key,
              fileName:       mpFilenameOverride ?? file.name,
              fileSize:       file.size,
              mimeType:       contentType,
              eventId:        destination.eventId,
              subfolderId:    destination.subfolderId ?? null,
              totalChunks:    totalParts,
              chunkSize:      effectiveChunkSize,
              completedParts: [],
              failedChunks:   [],
              status:         'active',
              startedAt:      new Date().toISOString(),
              lastProgressAt: new Date().toISOString(),
            })
            updateFile(uid, { totalParts })
          },

          // Fired after each chunk — update IDB so a crash/reload can resume.
          onPartDone: (completed: { PartNumber: number; ETag: string }[], done: number) => {
            void updateSession(effectiveSid, { completedParts: completed, status: 'active' })
            updateFile(uid, { doneParts: done })
          },

          onCompleting: () => updateFile(uid, { status: 'completing', progress: 99 }),
          onProgress: (pct: number) => {
            const bytesLoaded = Math.round((pct / 100) * file.size)
            const elapsed     = (Date.now() - mpStartedAt) / 1000
            const speed       = elapsed > 0.3 ? Math.round(bytesLoaded / elapsed) : undefined
            updateFile(uid, { progress: pct, bytesLoaded, speed })
          },
        })

        try {
          const result = await runMultipartUpload(makeMpOpts())

          // Success — clean up the IDB session (R2 object is now committed)
          void deleteSession(effectiveSid)
          updateFile(uid, {
            status:        'done',
            progress:      100,
            storedName:    mpFilenameOverride ?? undefined,
            versionNumber: result.versionNumber,
          })

        } catch (err: any) {
          if (err instanceof DuplicateError) {
            // DuplicateError comes from /multipart/create — no R2 session was opened yet.
            updateFile(uid, { status: 'paused', progress: 0, speed: undefined })
            const fname  = mpFilenameOverride ?? file.name
            const choice = await askDuplicateAction(fname, err.existingName)
            updateFile(uid, { status: 'starting' })

            if (choice === 'cancel') {
              updateFile(uid, { status: 'error', error: 'Upload cancelled' })
              return
            }
            if (choice === 'replace') {
              mpForce = true
            }
            if (choice === 'keep-both') {
              let found = false
              for (let n = 1; n <= 10; n++) {
                const candidate = addSuffix(file.name, n)
                const ckRes = await fetch('/api/upload/presign', {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({
                    filename:    candidate,
                    contentType,
                    fileSize:    file.size,
                    eventId:     destination.eventId,
                    subfolderId: destination.subfolderId,
                    checkOnly:   true,
                  }),
                })
                if (ckRes.status !== 409) { mpFilenameOverride = candidate; found = true; break }
              }
              if (!found) throw new Error(
                'Could not find a unique filename — please rename the file and retry',
              )
            }

            // Retry with resolved filename / force flag (fresh session — create never opened R2)
            try {
              const result2 = await runMultipartUpload(makeMpOpts())
              void deleteSession(effectiveSid)
              updateFile(uid, {
                status:     'done',
                progress:   100,
                storedName: mpFilenameOverride ?? undefined,
              })
              return
            } catch (retryErr: any) {
              if ((retryErr instanceof NetworkError) || !navigator.onLine) {
                void updateSession(effectiveSid, { status: 'paused' })
                throw new NetworkError('Connection lost — upload paused. Will resume when online.')
              }
              if (mpCtx.session) void abortMultipartSession(mpCtx.session.uploadId, mpCtx.session.key)
              void deleteSession(effectiveSid)
              throw retryErr
            }
          }

          const isNetworkDrop = (err instanceof NetworkError) || !navigator.onLine

          if (isNetworkDrop) {
            // Chunks already uploaded are safe in R2. Pause without aborting.
            // Mark session as paused in IDB so the resume banner shows on next visit.
            void updateSession(effectiveSid, { status: 'paused' })
            throw new NetworkError('Connection lost — upload paused. Will resume when online.')
          }

          // Genuine failure — abort the R2 session to free orphaned chunk storage.
          const s = mpCtx.session ?? (storedSession
            ? { uploadId: storedSession.uploadId, key: storedSession.key }
            : null
          )
          if (s) void abortMultipartSession(s.uploadId, s.key)
          void deleteSession(effectiveSid)    // session is no longer valid
          throw err
        }
      }
    } catch (err: any) {
      const isNetworkDrop = (err instanceof NetworkError) || !navigator.onLine
      if (isNetworkDrop) {
        // Paused, not errored — don't show a red X
        updateFile(uid, {
          status: 'paused',
          error:  undefined,
          speed:  undefined,
        })
      } else {
        updateFile(uid, { status: 'error', error: err.message ?? 'Upload failed' })
      }
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

    // Ask for notification permission the first time the user starts an upload.
    // Non-blocking — we don't await or gate the upload on the result.
    void requestNotificationPermission()

    // Reset error'd / queued-offline files to pending
    pending
      .filter(f => f.status === 'error' || f.status === 'queued-offline')
      .forEach(f => updateFile(f.uid, {
        status: 'pending', progress: 0, error: undefined,
        speed: undefined, bytesLoaded: undefined,
      }))

    // ── Latency probe — one tiny request decides the chunk size for this whole batch ────
    // Fast WiFi (< 100 ms) → 20 MB chunks (fewer round-trips, max throughput).
    // Normal (100–299 ms) → 10 MB chunks (balanced).
    // Slow (≥ 300 ms) → 5 MB chunks (minimum R2 allows; shorter recovery on drop).
    try {
      const t0 = Date.now()
      await fetch('/api/ping', { cache: 'no-store' })
      const ms = Date.now() - t0
      chunkSizeRef.current =
        ms < 100 ? 20 * 1024 * 1024  // fast WiFi  → 20 MB
        : ms < 300 ? 10 * 1024 * 1024  // normal     → 10 MB
        :             5 * 1024 * 1024  // slow        →  5 MB (R2 minimum)
    } catch {
      chunkSizeRef.current = 10 * 1024 * 1024
    }

    setIsUploading(true)

    // ── Smart two-queue strategy ────────────────────────────────────────────────
    // Small files (< 10 MB): up to 5 fly concurrently — finishes photos fast.
    // Large files (≥ 10 MB): strictly one at a time with 4 parallel internal chunks
    //   so the full bandwidth focuses on one file until it's fully committed.
    // Both queues drain simultaneously — photos don't wait for videos to start.
    const smallQueue = pending.filter(f => f.file.size < MULTIPART_THRESHOLD).map(f => f.uid)
    const largeQueue = pending.filter(f => f.file.size >= MULTIPART_THRESHOLD).map(f => f.uid)
    let si = 0

    async function smallWorker() {
      while (si < smallQueue.length) {
        const uid = smallQueue[si++]
        await uploadFile(uid)
      }
    }

    async function largeWorker() {
      for (const uid of largeQueue) {
        await uploadFile(uid)
      }
    }

    const workerPool: Promise<void>[] = []
    if (smallQueue.length > 0) {
      for (let i = 0; i < Math.min(MAX_CONCURRENT, smallQueue.length); i++) {
        workerPool.push(smallWorker())
      }
    }
    workerPool.push(largeWorker())

    await Promise.all(workerPool)
    setIsUploading(false)
    lastNotifPctRef.current = -NOTIF_THROTTLE_PCT

    // Send final PWA notification
    const errored = filesRef.current.filter(f => f.status === 'error').length
    if (errored > 0) {
      notifyUploadFailed(errored)
    } else {
      const completed = filesRef.current.filter(f => f.status === 'done').length
      if (completed > 0) {
        notifyUploadComplete(completed)
        // Bust SWR caches so FolderTree sidebar counts update immediately
        void invalidateFileCache(destination.eventId)
      }
    }
  }

  // ── Per-file retry (re-queues a single failed file without touching others) ──
  async function retryFile(uid: string) {
    if (!destination) return
    const uf = filesRef.current.find(f => f.uid === uid)
    if (!uf) return
    // Paused files remember their progress so the multipart path can resume
    const keepProgress = uf.status === 'paused'
    updateFile(uid, {
      status:      'pending',
      progress:    keepProgress ? uf.progress    : 0,
      bytesLoaded: keepProgress ? uf.bytesLoaded : undefined,
      error:       undefined,
      speed:       undefined,
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
  const pausedCount   = filesState.filter(f => f.status === 'paused').length
  const activeCount   = filesState.filter(f =>
    f.status === 'uploading' || f.status === 'starting' || f.status === 'completing',
  ).length
  // Paused files are excluded from uploadableCount — they auto-resume when online
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

  // ── Throttled PWA progress notification (fires during active upload) ───────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isUploading) return
    if (overallPct - lastNotifPctRef.current >= NOTIF_THROTTLE_PCT) {
      lastNotifPctRef.current = overallPct
      const speed = avgUploadSpeed > 0 ? formatSpeed(avgUploadSpeed) : undefined
      notifyUploadProgress(activeCount, filesState.length, overallPct, speed)
    }
  })

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
            {pausedCount > 0 ? (
              <>
                <p className="text-sm font-medium text-amber-300">Connection lost — uploads paused</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Your progress is saved. Uploads will resume automatically when connectivity returns.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-300">You're offline</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Files will be queued and uploaded automatically when your connection returns.
                </p>
              </>
            )}
          </div>
          {pausedCount > 0 && (
            <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400
                             px-2 py-1 rounded-full">
              {pausedCount} paused
            </span>
          )}
          {offlineCount > 0 && pausedCount === 0 && (
            <span className="shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400
                             px-2 py-1 rounded-full">
              {offlineCount} queued
            </span>
          )}
        </div>
      )}

      {/* ── Connection restored toast (auto-dismisses after 5 s) ────────────── */}
      {showRestoredBanner && (
        <div className="flex items-center gap-3 bg-emerald-950/60 border border-emerald-800/50
                        rounded-xl px-4 py-3">
          <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm font-medium text-emerald-300">
            Connection restored — resuming your uploads…
          </p>
        </div>
      )}

      {/* ── iOS keep-page-open tip ───────────────────────────────────────────── */}
      {isIOS && isUploading && (
        <div className="flex items-start gap-3 bg-sky-950/60 border border-sky-800/50
                        rounded-xl px-4 py-3">
          <span className="text-lg leading-none mt-0.5" aria-hidden>📱</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sky-300">iPhone tip: Keep this page open</p>
            <p className="text-xs text-sky-600 mt-0.5">
              Switching apps will pause your upload — your progress is saved and you can resume where you left off.
            </p>
          </div>
        </div>
      )}

      {/* ── Non-iOS / no Background Sync warning ────────────────────────────── */}
      {!isIOS && isUploading && typeof window !== 'undefined' && !('sync' in (window.ServiceWorkerRegistration?.prototype ?? {})) && (
        <div className="flex items-center gap-3 bg-amber-950/60 border border-amber-800/50
                        rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">Keep this page open</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Your browser doesn't support background uploads. Switching away from the app will pause your upload.
            </p>
          </div>
        </div>
      )}

      {/* ── Incomplete uploads from a previous session ───────────────────── */}
      {resumeSessions.length > 0 && (
        <div className="bg-violet-950/60 border border-violet-800/50 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-4 h-4 text-violet-400 shrink-0" />
            <p className="text-sm font-medium text-violet-300">
              {resumeSessions.length} upload{resumeSessions.length !== 1 ? 's' : ''} in progress from a previous session
            </p>
            <button
              onClick={() => { void discardAllSessions(); setResumeSessions([]) }}
              className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Discard all
            </button>
          </div>
          <ul className="space-y-1.5 pl-2">
            {resumeSessions.map(s => {
              const pct = s.totalChunks > 0
                ? Math.round((s.completedParts.length / s.totalChunks) * 100)
                : 0
              return (
                <li key={s.sessionId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{s.fileName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{pct}%</span>
                    </div>
                  </div>
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="shrink-0 text-xs font-medium text-violet-400 hover:text-violet-300
                               bg-violet-900/40 hover:bg-violet-900/60 px-2.5 py-1 rounded-lg transition"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => {
                      void deleteSession(s.sessionId)
                      setResumeSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                    }}
                    className="shrink-0 text-xs text-slate-600 hover:text-slate-400 transition"
                  >
                    Discard
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-slate-500 pt-0.5">
            Click <span className="text-slate-400">Resume</span> then select the same file — upload will continue from {resumeSessions.length !== 1 ? 'where each left' : 'where it left'} off.
          </p>
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

      {/* ── Pre-upload batch duplicate check dialog ──────────────────── */}
      {dupCheckEntries && (
        <DuplicateCheckDialog
          entries={dupCheckEntries}
          onResolve={handleDupCheckResolve}
          onCancel={handleDupCheckCancel}
        />
      )}

      {/* ── In-app navigation guard dialog ─────────────────────────────── */}
      {navGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">⚠️  Upload in progress</p>
              <p className="text-sm text-slate-400">
                {(() => {
                  const c = filesState.filter(f =>
                    ['pending', 'starting', 'uploading', 'completing'].includes(f.status)
                  ).length
                  return c === 1 ? 'You have 1 file uploading.' : `You have ${c} files uploading.`
                })()}
                {' '}Your progress is saved — you can come back and resume from where you left off.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleNavStay}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                           bg-indigo-600 hover:bg-indigo-500 transition"
              >
                Stay on page
              </button>
              <button
                onClick={handleNavLeave}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400
                           hover:text-white bg-slate-800 hover:bg-slate-700
                           border border-slate-700 hover:border-slate-600 transition"
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicate-file resolution dialog ─────────────────────────── */}
      {duplicatePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">File already exists</p>
              <p className="text-sm text-slate-400 break-all">
                <span className="text-white font-medium">{duplicatePrompt.filename}</span>
                {' '}was already uploaded to this event.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleDuplicateChoice('replace')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                           bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-700/50
                           text-left transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-300">Replace existing</p>
                  <p className="text-xs text-slate-500">Overwrite the current file with this version</p>
                </div>
              </button>

              <button
                onClick={() => handleDuplicateChoice('keep-both')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                           bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50
                           text-left transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">Keep both</p>
                  <p className="text-xs text-slate-500">Save with a new name (adds a number suffix)</p>
                </div>
              </button>

              <button
                onClick={() => handleDuplicateChoice('cancel')}
                className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-400
                           hover:text-white hover:bg-slate-800/60 border border-transparent
                           hover:border-slate-700/50 transition text-left"
              >
                Cancel upload
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}