'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Upload, X, FolderOpen, Film, Image as ImageIcon, File as FileIcon,
  Send, User, Search, AlertTriangle, CheckCircle2, Loader2, Lock,
  Link2, Copy, Check, Share2, Layers, ExternalLink, Plus,
} from 'lucide-react'
import {
  xhrPut,
  formatUploadSize,
  formatUploadSpeed,
  formatUploadEta,
  resolveUploadMimeType,
} from '@/lib/upload/client-utils'
import { useToast } from '@/lib/toast'
import type { HierarchyYear } from '@/types'

const MULTIPART_THRESHOLD = 10 * 1024 * 1024 // 10 MB -> chunked R2 multipart
const CHUNK_SIZE          = 10 * 1024 * 1024 // 10 MB per part
const PART_CONCURRENCY    = 4

interface StagedDeviceFile {
  uid:         string
  file:        File
  folderPath:  string | null
  progress:    number
  bytesLoaded: number
  status:      'pending' | 'uploading' | 'done' | 'error'
  r2Key?:      string
  error?:      string
}

interface LibraryMediaItem {
  id:             string
  originalName:   string
  fileType:       'PHOTO' | 'VIDEO'
  fileSize:       number
  status:         string
  subfolderLabel: string | null
  thumbnailUrl:   string | null
}

interface RecipientUser {
  id:       string
  username: string | null
  name:     string | null
  email:    string
  role:     string
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

async function uploadMultipartTransferFile(opts: {
  transferId: string
  file:       File
  folderPath: string | null
  mimeType:   string
  onProgress: (loaded: number) => void
}): Promise<string> {
  const { transferId, file, folderPath, mimeType, onProgress } = opts

  // 1. Initiate multipart upload
  const createRes = await fetch('/api/transfers/multipart', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      action:      'create',
      transferId,
      filename:    file.name,
      folderPath,
      contentType: mimeType,
    }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error ?? 'Failed to start multipart upload')
  const { uploadId, r2Key } = createData as { uploadId: string; r2Key: string }

  try {
    const totalParts = Math.ceil(file.size / CHUNK_SIZE)
    const completedParts: { PartNumber: number; ETag: string }[] = []
    const partLoaded = new Array<number>(totalParts).fill(0)

    const reportTotal = () => {
      const sum = partLoaded.reduce((a, b) => a + b, 0)
      onProgress(Math.min(file.size, sum))
    }

    // Presign parts in batches of 40
    const presignedUrls: Record<number, string> = {}
    for (let start = 1; start <= totalParts; start += 40) {
      const batchNums: number[] = []
      for (let p = start; p < start + 40 && p <= totalParts; p++) batchNums.push(p)
      const pRes = await fetch('/api/transfers/multipart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'presign-parts', r2Key, uploadId, partNumbers: batchNums }),
      })
      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error ?? 'Failed to presign parts')
      Object.assign(presignedUrls, pData.urls)
    }

    let nextIdx = 0
    async function partWorker() {
      while (nextIdx < totalParts) {
        const idx     = nextIdx++
        const partNum = idx + 1
        const start   = idx * CHUNK_SIZE
        const end     = Math.min(file.size, start + CHUNK_SIZE)
        const blob    = file.slice(start, end)
        const url     = presignedUrls[partNum]

        let lastErr: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const etag = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest()
              xhr.open('PUT', url)
              xhr.upload.onprogress = e => {
                if (e.lengthComputable) {
                  partLoaded[idx] = e.loaded
                  reportTotal()
                }
              }
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  const hdr = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag') ?? ''
                  partLoaded[idx] = blob.size
                  reportTotal()
                  resolve(hdr.replace(/"/g, ''))
                } else {
                  reject(new Error(`Part ${partNum} HTTP ${xhr.status}`))
                }
              }
              xhr.onerror = () => reject(new Error('Network error during part upload'))
              xhr.send(blob)
            })
            completedParts.push({ PartNumber: partNum, ETag: etag })
            lastErr = null
            break
          } catch (err) {
            lastErr = err
            await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
          }
        }
        if (lastErr) throw lastErr
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PART_CONCURRENCY, totalParts) }, () => partWorker()),
    )

    // 3. Complete multipart upload
    const compRes = await fetch('/api/transfers/multipart', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'complete', r2Key, uploadId, parts: completedParts }),
    })
    const compData = await compRes.json()
    if (!compRes.ok) throw new Error(compData.error ?? 'Failed to finalize multipart upload')

    return r2Key
  } catch (err) {
    fetch('/api/transfers/multipart', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'abort', r2Key, uploadId }),
    }).catch(() => {})
    throw err
  }
}

export function NewTransferForm() {
  const toast       = useToast()
  const fileInput   = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  // Tabs: Source ('device' | 'library') & Delivery ('link' | 'teammate')
  const [sourceTab,    setSourceTab]    = useState<'device' | 'library'>('device')
  const [deliveryMode, setDeliveryMode] = useState<'link' | 'teammate'>('link')

  // Device staged files
  const [deviceFiles, setDeviceFiles] = useState<StagedDeviceFile[]>([])

  // CMMS Library picker state
  const [years,           setYears]           = useState<HierarchyYear[]>([])
  const [libYear,         setLibYear]         = useState('')
  const [libCat,          setLibCat]          = useState('')
  const [libEventId,      setLibEventId]      = useState('')
  const [libSubId,        setLibSubId]        = useState('')
  const [libFiles,        setLibFiles]        = useState<LibraryMediaItem[]>([])
  const [libLoading,      setLibLoading]      = useState(false)
  const [selectedLibrary, setSelectedLibrary] = useState<Map<string, LibraryMediaItem>>(new Map())

  // Metadata & recipient
  const [subject,           setSubject]           = useState('')
  const [message,           setMessage]           = useState('')
  const [expiresInDays,     setExpiresInDays]     = useState(14)
  const [pinEnabled,        setPinEnabled]        = useState(false)
  const [pin,               setPin]               = useState('')
  const [alsoCreateLink,    setAlsoCreateLink]    = useState(true)
  const [userQuery,         setUserQuery]         = useState('')
  const [userResults,       setUserResults]       = useState<RecipientUser[]>([])
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientUser | null>(null)

  // Upload progress & completion
  const [sending,     setSending]     = useState(false)
  const [speedBps,    setSpeedBps]    = useState(0)
  const [error,       setError]       = useState('')
  const [completedResult, setCompletedResult] = useState<{
    transferId: string
    shareUrl:   string | null
    totalFiles: number
    totalSize:  number
    recipientLabel: string | null
  } | null>(null)
  const [copied, setCopied] = useState(false)

  // Load CMMS hierarchy when switching to Library tab
  useEffect(() => {
    if (sourceTab !== 'library' || years.length > 0) return
    fetch('/api/hierarchy')
      .then(r => r.json())
      .then(d => {
        const yrs: HierarchyYear[] = d.years ?? []
        setYears(yrs)
        if (yrs[0]) setLibYear(String(yrs[0].year))
      })
      .catch(() => {})
  }, [sourceTab, years.length])

  // Load files in selected CMMS event/subfolder
  useEffect(() => {
    if (!libEventId) {
      setLibFiles([])
      return
    }
    setLibLoading(true)
    const params = new URLSearchParams({ eventId: libEventId })
    if (libSubId) params.set('subfolderId', libSubId)
    fetch(`/api/transfers/library-files?${params.toString()}`)
      .then(r => r.json())
      .then(d => setLibFiles(d.files ?? []))
      .catch(() => setLibFiles([]))
      .finally(() => setLibLoading(false))
  }, [libEventId, libSubId])

  // Search CMMS users for Teammate mode
  useEffect(() => {
    if (deliveryMode !== 'teammate' || userQuery.trim().length < 1) {
      setUserResults([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(userQuery.trim())}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => setUserResults(d.users ?? []))
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [userQuery, deliveryMode])

  // Screen Wake Lock during active transfer upload
  useEffect(() => {
    if (!sending || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let sentinel: { release?: () => Promise<void> } | null = null
    ;(navigator as any).wakeLock.request('screen').then((s: any) => { sentinel = s }).catch(() => {})
    return () => { sentinel?.release?.().catch(() => {}) }
  }, [sending])

  function addDeviceFiles(rawFiles: File[]) {
    if (rawFiles.length === 0) return
    const next: StagedDeviceFile[] = rawFiles.map(f => {
      const rel = (f as any).webkitRelativePath as string | undefined
      const folderPath = rel && rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : null
      return {
        uid:         `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        file:        f,
        folderPath,
        progress:    0,
        bytesLoaded: 0,
        status:      'pending',
      }
    })
    setDeviceFiles(prev => [...prev, ...next])
    if (!subject.trim() && rawFiles[0]) {
      const baseName = rawFiles[0].name.replace(/\.[^.]+$/, '')
      setSubject(rawFiles.length > 1 ? `${baseName} + ${rawFiles.length - 1} more` : baseName)
    }
  }

  function toggleLibraryItem(item: LibraryMediaItem) {
    setSelectedLibrary(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
    if (!subject.trim()) {
      const selEvent = years
        .flatMap(y => y.categories)
        .flatMap(c => c.events)
        .find(e => e.id === libEventId)
      if (selEvent) setSubject(selEvent.name)
    }
  }

  const totalDeviceBytes  = deviceFiles.reduce((s, f) => s + f.file.size, 0)
  const loadedDeviceBytes = deviceFiles.reduce((s, f) => s + (f.status === 'done' ? f.file.size : f.bytesLoaded), 0)
  const totalLibBytes     = Array.from(selectedLibrary.values()).reduce((s, f) => s + f.fileSize, 0)
  const totalCount        = deviceFiles.length + selectedLibrary.size
  const totalBytes        = totalDeviceBytes + totalLibBytes
  const overallPct        = totalDeviceBytes > 0 ? Math.round((loadedDeviceBytes / totalDeviceBytes) * 100) : 100
  const remainingBytes    = Math.max(0, totalDeviceBytes - loadedDeviceBytes)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (totalCount === 0) {
      setError('Please add at least one photo or video.')
      return
    }
    if (!subject.trim()) {
      setError('Please enter a title / subject for this transfer.')
      return
    }
    if (deliveryMode === 'teammate' && !selectedRecipient) {
      setError('Please select a CMMS teammate or switch to "Instant Share Link".')
      return
    }
    if (pinEnabled && !/^\d{4}$/.test(pin)) {
      setError('PIN must be 4 digits.')
      return
    }

    setSending(true)
    setError('')
    const transferId = generateUUID()
    const startTime  = Date.now()

    try {
      const uploadedRecords: {
        originalName: string
        r2Key:        string
        fileSize:     number
        mimeType:     string
        folderPath:   string | null
        checksum:     string
      }[] = []

      // Upload device files sequentially for large (>=10MB) with parallel chunks, or direct XHR PUT for <10MB
      for (let i = 0; i < deviceFiles.length; i++) {
        const item     = deviceFiles[i]
        const mimeType = resolveUploadMimeType(item.file.name, item.file.type) || 'application/octet-stream'

        setDeviceFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))

        let r2Key: string
        if (item.file.size >= MULTIPART_THRESHOLD) {
          r2Key = await uploadMultipartTransferFile({
            transferId,
            file:       item.file,
            folderPath: item.folderPath,
            mimeType,
            onProgress: (loaded) => {
              const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000)
              setDeviceFiles(prev => {
                const updated = prev.map((f, idx) =>
                  idx === i
                    ? { ...f, bytesLoaded: loaded, progress: Math.round((loaded / item.file.size) * 100) }
                    : f
                )
                const totalLoadedNow = updated.reduce((s, f) => s + (f.status === 'done' ? f.file.size : f.bytesLoaded), 0)
                setSpeedBps(Math.round(totalLoadedNow / elapsedSec))
                return updated
              })
            },
          })
        } else {
          const presignRes = await fetch('/api/transfers/presign', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              transferId,
              filename:    item.file.name,
              folderPath:  item.folderPath,
              contentType: mimeType,
            }),
          })
          const presignData = await presignRes.json()
          if (!presignRes.ok) throw new Error(presignData.error ?? 'Failed to prepare upload')
          r2Key = presignData.r2Key

          await xhrPut(presignData.presignedUrl, item.file, mimeType, (loaded) => {
            const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000)
            setDeviceFiles(prev => {
              const updated = prev.map((f, idx) =>
                idx === i
                  ? { ...f, bytesLoaded: loaded, progress: Math.round((loaded / Math.max(1, item.file.size)) * 100) }
                  : f
              )
              const totalLoadedNow = updated.reduce((s, f) => s + (f.status === 'done' ? f.file.size : f.bytesLoaded), 0)
              setSpeedBps(Math.round(totalLoadedNow / elapsedSec))
              return updated
            })
          })
        }

        setDeviceFiles(prev =>
          prev.map((f, idx) => idx === i ? { ...f, status: 'done', progress: 100, bytesLoaded: item.file.size, r2Key } : f)
        )

        uploadedRecords.push({
          originalName: item.file.name,
          r2Key,
          fileSize:     item.file.size,
          mimeType,
          folderPath:   item.folderPath,
          checksum:     '',
        })
      }

      // Finalize Transfer + optional ShareLink + any selected CMMS library files
      const createRes = await fetch('/api/transfers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:               transferId,
          deliveryMode,
          recipientId:      deliveryMode === 'teammate' ? selectedRecipient?.id : undefined,
          createShareLink:  deliveryMode === 'link' || alsoCreateLink,
          subject:          subject.trim(),
          message:          message.trim() || null,
          files:            uploadedRecords,
          existingMediaIds: Array.from(selectedLibrary.keys()),
          isPinProtected:   pinEnabled,
          pin:              pinEnabled ? pin : null,
          expiresInDays,
        }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson.error ?? 'Failed to finalize transfer')

      toast.success('Transfer ready to share!')
      setCompletedResult({
        transferId:     createJson.transferId,
        shareUrl:       createJson.shareUrl ?? null,
        totalFiles:     createJson.totalFiles,
        totalSize:      createJson.totalSize,
        recipientLabel: deliveryMode === 'teammate' && selectedRecipient
          ? (selectedRecipient.username ?? selectedRecipient.name ?? selectedRecipient.email)
          : null,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Transfer failed. Please check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  // ── Completion View (Instant Link + WhatsApp + Native Share) ──────────────
  if (completedResult) {
    return (
      <div className="max-w-2xl rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 shrink-0">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Transfer Ready!</h2>
            <p className="text-sm text-slate-300 mt-1">
              {completedResult.totalFiles} file{completedResult.totalFiles !== 1 ? 's' : ''} ({formatUploadSize(completedResult.totalSize)})
              {completedResult.recipientLabel ? ` sent to ${completedResult.recipientLabel}` : ' packaged and ready to share'}.
            </p>
          </div>
        </div>

        {completedResult.shareUrl && (
          <div className="space-y-3 rounded-2xl bg-slate-950/70 border border-slate-800 p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Shareable Download Link
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={completedResult.shareUrl}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(completedResult.shareUrl!)
                  setCopied(true)
                  toast.success('Link copied to clipboard!')
                  setTimeout(() => setCopied(false), 2500)
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                           bg-indigo-600 hover:bg-indigo-500 text-white transition shrink-0"
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy Link</>}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${subject.trim()}: ${completedResult.shareUrl}${pinEnabled ? ` (PIN: ${pin})` : ''}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold
                           bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                Share on WhatsApp
              </a>

              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.share({
                      title: subject.trim(),
                      text:  message.trim() || subject.trim(),
                      url:   completedResult.shareUrl!,
                    }).catch(() => {})
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium
                             bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  More Apps
                </button>
              )}

              <a
                href={completedResult.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium
                           bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Preview Page
              </a>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={`/transfers/sent/${completedResult.transferId}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                       bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
          >
            View Transfer Details
          </Link>
          <button
            type="button"
            onClick={() => {
              setCompletedResult(null)
              setDeviceFiles([])
              setSelectedLibrary(new Map())
              setSubject('')
              setMessage('')
              setPin('')
              setPinEnabled(false)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       text-indigo-300 hover:text-white bg-indigo-600/20 border border-indigo-500/30 transition"
          >
            <Plus className="w-4 h-4" />
            Send Another Transfer
          </button>
        </div>
      </div>
    )
  }

  const yearObj    = years.find(y => String(y.year) === libYear)
  const categories = yearObj?.categories.filter(c => !c.isArchived) ?? []
  const catObj     = categories.find(c => c.name === libCat)
  const events     = catObj?.events ?? []
  const eventObj   = events.find(e => e.id === libEventId)

  return (
    <form onSubmit={handleSend} className="max-w-3xl space-y-6">
      {/* ── Step 1: Choose Source (Upload from Device OR Pick from CMMS Events) ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-white">1. Add Photos or Videos</h2>
          <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1">
            <button
              type="button"
              onClick={() => setSourceTab('device')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                sourceTab === 'device' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload from Device
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('library')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                sourceTab === 'library' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Pick from CMMS Events
              {selectedLibrary.size > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{selectedLibrary.size}</span>
              )}
            </button>
          </div>
        </div>

        {sourceTab === 'device' ? (
          <div className="space-y-3">
            <div
              onClick={() => fileInput.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                addDeviceFiles(Array.from(e.dataTransfer.files))
              }}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-500
                         bg-slate-950/40 py-10 px-4 text-center transition space-y-2"
            >
              <Upload className="w-8 h-8 text-indigo-400 mx-auto" />
              <p className="text-sm font-medium text-white">Tap to browse or drag & drop photos/videos</p>
              <p className="text-xs text-slate-400">
                Supports large 4K videos (MP4, MOV, MKV), RAW photos, audio & project files via 10 MB resumable chunks
              </p>
              <div className="pt-2 flex justify-center gap-2" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Select Files
                </button>
                <button
                  type="button"
                  onClick={() => folderInput.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  Select Whole Folder
                </button>
              </div>
            </div>

            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) addDeviceFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <input
              ref={folderInput}
              type="file"
              multiple
              // @ts-expect-error webkitdirectory is non-standard HTML attribute
              webkitdirectory=""
              className="hidden"
              onChange={e => {
                if (e.target.files) addDeviceFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={libYear}
                onChange={e => { setLibYear(e.target.value); setLibCat(''); setLibEventId(''); setLibSubId('') }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-white"
              >
                <option value="">Year</option>
                {years.map(y => <option key={y.id} value={String(y.year)}>{y.year}</option>)}
              </select>

              <select
                value={libCat}
                onChange={e => { setLibCat(e.target.value); setLibEventId(''); setLibSubId('') }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-white"
              >
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>

              <select
                value={libEventId}
                disabled={!libCat}
                onChange={e => { setLibEventId(e.target.value); setLibSubId('') }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-white disabled:opacity-50"
              >
                <option value="">Select Event</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>

            {eventObj && eventObj.subfolders.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLibSubId('')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                    !libSubId ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  All folders
                </button>
                {eventObj.subfolders.map(sf => (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => setLibSubId(sf.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      libSubId === sf.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
            )}

            {libLoading ? (
              <div className="py-8 flex justify-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : libEventId && libFiles.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No files in this folder yet.</p>
            ) : libFiles.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{libFiles.length} file{libFiles.length !== 1 ? 's' : ''} available (zero re-upload)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLibrary(prev => {
                        const next = new Map(prev)
                        for (const item of libFiles) next.set(item.id, item)
                        return next
                      })
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Select all in folder
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {libFiles.map(item => {
                    const checked = selectedLibrary.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleLibraryItem(item)}
                        className={`text-left rounded-xl border p-2 transition ${
                          checked
                            ? 'border-indigo-500 bg-indigo-600/20'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="aspect-video rounded-lg bg-slate-800 overflow-hidden mb-1.5 relative flex items-center justify-center">
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnailUrl} alt={item.originalName} className="w-full h-full object-cover" />
                          ) : item.fileType === 'VIDEO' ? (
                            <Film className="w-5 h-5 text-slate-500" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-500" />
                          )}
                          {checked && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-white truncate">{item.originalName}</p>
                        <p className="text-[10px] text-slate-400">{formatUploadSize(item.fileSize)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">Choose a Category and Event above to attach existing CMMS media instantly.</p>
            )}
          </div>
        )}

        {/* Selected items summary */}
        {totalCount > 0 && (
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                {totalCount} file{totalCount !== 1 ? 's' : ''} attached ({formatUploadSize(totalBytes)})
              </span>
              {!sending && (
                <button
                  type="button"
                  onClick={() => { setDeviceFiles([]); setSelectedLibrary(new Map()) }}
                  className="text-slate-400 hover:text-white underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {deviceFiles.map((df, idx) => (
                <div key={df.uid} className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-2">
                  {df.file.type.startsWith('video/') ? (
                    <Film className="w-4 h-4 text-violet-400 shrink-0" />
                  ) : df.file.type.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{df.file.name}</p>
                    {df.status === 'uploading' && (
                      <div className="mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${df.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {df.status === 'uploading' ? `${df.progress}%` : df.status === 'done' ? '✓ Done' : formatUploadSize(df.file.size)}
                  </span>
                  {!sending && (
                    <button
                      type="button"
                      onClick={() => setDeviceFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {Array.from(selectedLibrary.values()).map(item => (
                <div key={item.id} className="flex items-center gap-2.5 bg-indigo-950/30 border border-indigo-500/20 rounded-xl px-3 py-2">
                  <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                  <p className="text-xs text-white truncate flex-1">{item.originalName}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">CMMS Instant</span>
                  {!sending && (
                    <button
                      type="button"
                      onClick={() => toggleLibraryItem(item)}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: How to Share (Instant Link vs CMMS Teammate) ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-white">2. How Would You Like to Share?</h2>
          <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-1">
            <button
              type="button"
              onClick={() => setDeliveryMode('link')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                deliveryMode === 'link' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Instant Link / WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode('teammate')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                deliveryMode === 'teammate' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              CMMS Teammate
            </button>
          </div>
        </div>

        {deliveryMode === 'teammate' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Recipient Teammate</label>
            {selectedRecipient ? (
              <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-medium text-white">
                    {selectedRecipient.username ?? selectedRecipient.name ?? selectedRecipient.email}
                  </p>
                  <p className="text-xs text-slate-400">{selectedRecipient.email} · {selectedRecipient.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecipient(null)}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  placeholder="Search teammate by name or email…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-500"
                />
                {userResults.length > 0 && (
                  <div className="mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl divide-y divide-slate-800 max-h-48 overflow-y-auto">
                    {userResults.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedRecipient(u); setUserQuery(''); setUserResults([]) }}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm text-white font-medium">{u.username ?? u.name ?? u.email}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{u.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoCreateLink}
                onChange={e => setAlsoCreateLink(e.target.checked)}
                className="rounded border-slate-600 text-indigo-600"
              />
              Also generate a shareable link (for WhatsApp / quick access)
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-400">Title / Subject *</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Jewels Kids Camp Day 1 Videos"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Link Expiry</label>
            <select
              value={expiresInDays}
              onChange={e => setExpiresInDays(Number(e.target.value))}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400">Note / Instructions (optional)</label>
          <textarea
            rows={2}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Optional message for the recipient…"
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-base sm:text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pinEnabled}
              onChange={e => setPinEnabled(e.target.checked)}
              className="rounded border-slate-600 text-indigo-600"
            />
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Protect with 4-digit PIN
          </label>
          {pinEnabled && (
            <input
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="0000"
              className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-base sm:text-sm tracking-[0.3em] text-white text-center"
            />
          )}
        </div>
      </div>

      {/* Live Upload Progress Card */}
      {sending && totalDeviceBytes > 0 && (
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white font-semibold">
              Uploading transfer… {overallPct}%
            </span>
            {speedBps > 0 && remainingBytes > 0 && (
              <span className="text-slate-400">
                {formatUploadSpeed(speedBps)} · ~{formatUploadEta(remainingBytes, speedBps)} remaining
              </span>
            )}
          </div>
          <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={sending || totalCount === 0}
        className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white
                   bg-gradient-to-r from-indigo-600 to-violet-600
                   hover:from-indigo-500 hover:to-violet-500
                   disabled:opacity-40 disabled:cursor-not-allowed transition
                   flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
      >
        {sending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Uploading & Preparing Link…</>
        ) : deliveryMode === 'link' ? (
          <><Link2 className="w-4 h-4" /> Upload & Create Share Link ({totalCount} file{totalCount !== 1 ? 's' : ''})</>
        ) : (
          <><Send className="w-4 h-4" /> Send Transfer ({totalCount} file{totalCount !== 1 ? 's' : ''})</>
        )}
      </button>
    </form>
  )
}
