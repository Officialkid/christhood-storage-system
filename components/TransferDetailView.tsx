'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Download, File as FileIcon, Folder, ChevronDown, ChevronRight,
  FileText, Image as ImageIcon, Video as VideoIcon, Music,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, Upload, X, FolderOpen, Lock, Send, AlertTriangle,
  CheckCheck, ShieldCheck, ShieldAlert, Loader2,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

interface TransferFileItem {
  id: string
  originalName: string
  fileSize: number
  mimeType: string
  folderPath: string | null
  checksum: string
}

interface ResponseFile {
  id: string
  originalName: string
  fileSize: number
  mimeType: string
  folderPath: string | null
  checksum: string
}

interface TransferResponseData {
  id: string
  message: string | null
  totalFiles: number
  totalSize: number
  createdAt: string
  files: ResponseFile[]
}

interface TransferDetailData {
  id: string
  subject: string
  message: string | null
  status: TransferStatus
  totalFiles: number
  totalSize: number
  expiresAt: string
  createdAt: string
  sender: { id: string; username: string | null; name: string | null; email: string | null }
  files: TransferFileItem[]
  response: TransferResponseData | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

async function computeSHA256(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function mimeIcon(mimeType: string, className = 'w-4 h-4 shrink-0') {
  if (mimeType.startsWith('image/')) return <ImageIcon className={`${className} text-blue-400`} />
  if (mimeType.startsWith('video/')) return <VideoIcon className={`${className} text-purple-400`} />
  if (mimeType.startsWith('audio/')) return <Music className={`${className} text-pink-400`} />
  if (mimeType === 'application/pdf') return <FileText className={`${className} text-red-400`} />
  return <FileIcon className={`${className} text-slate-400`} />
}

const STATUS_META: Record<TransferStatus, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  PENDING:    { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',          Icon: Clock        },
  DOWNLOADED: { label: 'Downloaded',        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',             Icon: CheckCircle2 },
  RESPONDED:  { label: 'Response Sent',     cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',    Icon: RefreshCcw   },
  COMPLETED:  { label: 'Completed',         cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',          Icon: Archive      },
  EXPIRED:    { label: 'Expired',           cls: 'bg-red-500/20 text-red-400 border border-red-500/30',                Icon: AlertCircle  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder tree helpers (used for both original files and response files)
// ─────────────────────────────────────────────────────────────────────────────

interface FolderNode { name: string; children: Map<string, FolderNode>; files: TransferFileItem[] }

function buildFolderTree(files: TransferFileItem[]): FolderNode {
  const root: FolderNode = { name: '', children: new Map(), files: [] }
  for (const f of files) {
    if (!f.folderPath) { root.files.push(f); continue }
    const parts = f.folderPath.replace(/^\/|\/$/g, '').split('/')
    let node = root
    for (const part of parts) {
      if (!node.children.has(part))
        node.children.set(part, { name: part, children: new Map(), files: [] })
      node = node.children.get(part)!
    }
    node.files.push(f)
  }
  return root
}

function FolderTreeView({
  node,
  transferId,
  onDownloadFile,
  downloadingFile,
  integrityMap,
  depth = 0,
}: {
  node: FolderNode
  transferId: string
  onDownloadFile: (file: TransferFileItem) => void
  downloadingFile: string | null
  integrityMap?: Record<string, boolean | null>
  depth?: number
}) {
  const [open, setOpen] = useState(true)
  if (node.children.size === 0 && node.files.length === 0) return null

  return (
    <div>
      {node.name && (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white text-xs py-1 w-full text-left"
          style={{ paddingLeft: `${depth * 14}px` }}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <Folder className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
          <span className="truncate font-medium">{node.name}</span>
        </button>
      )}
      {(!node.name || open) && (
        <div style={{ paddingLeft: node.name ? `${(depth + 1) * 14}px` : '0' }}>
          {node.files.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-2 py-1.5 group">
              <div className="flex items-center gap-2 min-w-0">
                {mimeIcon(f.mimeType)}
                <span className="text-xs text-slate-300 truncate">{f.originalName}</span>
                <span className="text-xs text-slate-600 shrink-0">{fmtSize(f.fileSize)}</span>
                {integrityMap && integrityMap[f.id] === true  && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 shrink-0">
                    <ShieldCheck className="w-3 h-3" />Verified
                  </span>
                )}
                {integrityMap && integrityMap[f.id] === false && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400 shrink-0">
                    <ShieldAlert className="w-3 h-3" />Issue
                  </span>
                )}
              </div>
              <button
                onClick={() => onDownloadFile(f)}
                disabled={downloadingFile === f.id}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 transition-all text-slate-400 hover:text-white disabled:opacity-50"
                title="Download file"
              >
                {downloadingFile === f.id
                  ? <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-white rounded-full animate-spin block" />
                  : <Download className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          ))}
          {Array.from(node.children.values()).map(child => (
            <FolderTreeView
              key={child.name}
              node={child}
              transferId={transferId}
              onDownloadFile={onDownloadFile}
              downloadingFile={downloadingFile}
              integrityMap={integrityMap}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Response upload helpers
// ─────────────────────────────────────────────────────────────────────────────

interface StagedFile {
  uid:        string
  file:       File
  folderPath: string | null
}

async function collectFromEntry(
  entry: FileSystemEntry,
  basePath = '',
): Promise<{ file: File; folderPath: string | null }[]> {
  if (entry.isFile) {
    return new Promise(resolve => {
      ;(entry as FileSystemFileEntry).file(f =>
        resolve([{ file: f, folderPath: basePath || null }])
      )
    })
  }
  if (entry.isDirectory) {
    const subPath  = basePath ? `${basePath}/${entry.name}` : entry.name
    const reader   = (entry as FileSystemDirectoryEntry).createReader()
    const all: FileSystemEntry[] = []
    await new Promise<void>((resolve, reject) => {
      const readBatch = () =>
        reader.readEntries(batch => {
          if (batch.length === 0) { resolve(); return }
          all.push(...batch)
          readBatch()
        }, reject)
      readBatch()
    })
    // Process sub-entries sequentially — concurrent FileSystemDirectoryReader instances
    // can silently drop results on Chromium (especially mobile). Sequential reads are safe.
    const results: { file: File; folderPath: string | null }[][] = []
    for (const e of all) {
      results.push(await collectFromEntry(e, subPath))
    }
    return results.flat()
  }
  return []
}

interface StagedFolderNode { __files: StagedFile[]; [k: string]: StagedFolderNode | StagedFile[] }

function buildStagedTree(files: StagedFile[]): StagedFolderNode {
  const root = { __files: [] as StagedFile[] } as StagedFolderNode
  for (const f of files) {
    if (!f.folderPath) { root.__files.push(f); continue }
    const parts = f.folderPath.split('/')
    let node = root
    for (const p of parts) {
      if (!node[p]) (node[p] as StagedFolderNode) = { __files: [] }
      node = node[p] as StagedFolderNode
    }
    node.__files.push(f)
  }
  return root
}

function StagedFolderNode({ name, node, depth = 0 }: { name: string; node: StagedFolderNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  const childKeys = Object.keys(node).filter(k => k !== '__files')
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white py-0.5 w-full text-left"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0 text-slate-500" /> : <ChevronRight className="w-3 h-3 shrink-0 text-slate-500" />}
        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span className="truncate">{name}</span>
        <span className="text-slate-600 ml-1">({(node.__files as StagedFile[]).length})</span>
      </button>
      {open && (
        <div>
          {childKeys.map(k => (
            <StagedFolderNode key={k} name={k} node={node[k] as StagedFolderNode} depth={depth + 1} />
          ))}
          {(node.__files as StagedFile[]).map(f => (
            <div key={f.uid} className="flex items-center gap-1.5 text-xs text-slate-400 py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              {mimeIcon(f.file.type || 'application/octet-stream', 'w-3.5 h-3.5 shrink-0')}
              <span className="truncate">{f.file.name}</span>
              <span className="text-slate-600 ml-1 shrink-0">{fmtSize(f.file.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ResponseSection — shown below original files
// ─────────────────────────────────────────────────────────────────────────────

function ResponseSection({
  transferId,
  currentStatus,
  existingResponse,
  onSubmitted,
}: {
  transferId:       string
  currentStatus:    TransferStatus
  existingResponse: TransferResponseData | null
  onSubmitted:      (response: TransferResponseData) => void
}) {
  // Drop zone state
  const dropRef            = useRef<HTMLDivElement>(null)
  const fileInputRef       = useRef<HTMLInputElement>(null)
  const folderInputRef     = useRef<HTMLInputElement>(null)
  const [staged,         setStaged]         = useState<StagedFile[]>([])
  const [isDragging,     setIsDragging]     = useState(false)
  const [showTree,       setShowTree]       = useState(false)
  const [message,        setMessage]        = useState('')
  const [uploadStatus,   setUploadStatus]   = useState<'idle' | 'uploading' | 'submitting' | 'done' | 'error'>('idle')
  const [progress,       setProgress]       = useState({ done: 0, total: 0 })
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null)

  const totalSize   = staged.reduce((s, f) => s + f.file.size, 0)
  const hasFolders  = staged.some(f => f.folderPath)
  const busy        = uploadStatus === 'uploading' || uploadStatus === 'submitting'
  const canSubmit   = staged.length > 0 && !busy

  // ── LOCKED state  ─────────────────────────────────────────────────────────
  if (currentStatus === 'PENDING') {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 text-center">
        <Lock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 font-medium mb-1">Download first to unlock</p>
        <p className="text-sm text-slate-500">
          Use the "Download All" button above to download the files, then this section will unlock.
        </p>
      </div>
    )
  }

  // ── EXPIRED state ─────────────────────────────────────────────────────────
  if (currentStatus === 'EXPIRED') {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-red-300 font-medium">Transfer expired</p>
        <p className="text-sm text-slate-500 mt-1">Responses can no longer be submitted.</p>
      </div>
    )
  }

  // ── RESPONDED / COMPLETED — read-only submitted view ─────────────────────
  const responseData = existingResponse ?? (uploadStatus === 'done' ? null : null)
  if ((currentStatus === 'RESPONDED' || currentStatus === 'COMPLETED') && existingResponse) {
    const respTree = buildFolderTree(existingResponse.files)
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20">
              <CheckCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Response submitted</p>
              <p className="text-xs text-slate-500">
                Sent {format(new Date(existingResponse.createdAt), 'dd MMM yyyy, HH:mm')}
                {' '}({formatDistanceToNow(new Date(existingResponse.createdAt), { addSuffix: true })})
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            {existingResponse.totalFiles} file{existingResponse.totalFiles !== 1 ? 's' : ''} · {fmtSize(existingResponse.totalSize)}
          </span>
        </div>

        {existingResponse.message && (
          <div className="mx-5 p-3 rounded-lg bg-slate-800/60 border border-slate-700/40">
            <p className="text-xs text-slate-500 mb-1">Your note to admin</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{existingResponse.message}</p>
          </div>
        )}

        {/* File list */}
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Uploaded files</p>
          <FolderTreeView
            node={respTree}
            transferId={transferId}
            onDownloadFile={() => {}}
            downloadingFile={null}
          />
        </div>
      </div>
    )
  }

  // ── DOWNLOADED — show response upload form ────────────────────────────────

  function ingest(incoming: { file: File; folderPath: string | null }[]) {
    setStaged(prev => {
      const existing = new Set(prev.map(f => `${f.file.name}|${f.file.size}|${f.folderPath ?? ''}`))
      const fresh = incoming
        .filter(({ file, folderPath }) => !existing.has(`${file.name}|${file.size}|${folderPath ?? ''}`))
        .map(({ file, folderPath }) => ({ uid: crypto.randomUUID(), file, folderPath }))
      return [...prev, ...fresh]
    })
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }

  const onDragLeave = (e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items)
    const collected: { file: File; folderPath: string | null }[] = []
    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry()
      if (!entry) continue
      collected.push(...await collectFromEntry(entry, ''))
    }
    ingest(collected)
  }

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    ingest(Array.from(e.target.files).map(f => ({
      file: f,
      folderPath: f.webkitRelativePath
        ? f.webkitRelativePath.split('/').slice(0, -1).join('/') || null
        : null,
    })))
    e.target.value = ''
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setUploadStatus('uploading')
    setProgress({ done: 0, total: staged.length })
    setErrorMsg(null)

    try {
      const uploaded: {
        originalName: string; r2Key: string; fileSize: number
        mimeType: string; folderPath: string | null; checksum: string
      }[] = []

      for (const sf of staged) {
        // 1. Get presigned URL
        const presignRes = await fetch(`/api/transfers/${transferId}/respond/presign`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            filename:    sf.file.name,
            folderPath:  sf.folderPath,
            contentType: sf.file.type || 'application/octet-stream',
          }),
        })
        if (!presignRes.ok) {
          const d = await presignRes.json().catch(() => ({}))
          throw new Error(d.error ?? `Could not presign ${sf.file.name}`)
        }
        const { presignedUrl, r2Key } = await presignRes.json()

        // 2. SHA-256 (byte-for-byte integrity guarantee)
        const checksum = await computeSHA256(sf.file)

        // 3. PUT to R2 — file stored exactly as-is, no processing
        const putRes = await fetch(presignedUrl, {
          method:  'PUT',
          body:    sf.file,
          headers: { 'Content-Type': sf.file.type || 'application/octet-stream' },
        })
        if (!putRes.ok) throw new Error(`Upload failed for ${sf.file.name}`)

        uploaded.push({
          originalName: sf.file.name,
          r2Key,
          fileSize:     sf.file.size,
          mimeType:     sf.file.type || 'application/octet-stream',
          folderPath:   sf.folderPath,
          checksum,
        })
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }

      // 4. Submit response record to DB
      setUploadStatus('submitting')
      const submitRes = await fetch(`/api/transfers/${transferId}/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ files: uploaded, message: message.trim() || null }),
      })
      if (!submitRes.ok) {
        const d = await submitRes.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to submit response')
      }

      const { responseId } = await submitRes.json()

      // Build a local TransferResponseData to display immediately
      const responseNow: TransferResponseData = {
        id:         responseId,
        message:    message.trim() || null,
        totalFiles: staged.length,
        totalSize,
        createdAt:  new Date().toISOString(),
        files: uploaded.map((f, i) => ({
          id:           `local-${i}`,
          originalName: f.originalName,
          fileSize:     f.fileSize,
          mimeType:     f.mimeType,
          folderPath:   f.folderPath,
          checksum:     '',
        })),
      }

      setUploadStatus('done')
      onSubmitted(responseNow)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      setUploadStatus('error')
    }
  }

  const tree       = buildStagedTree(staged)
  const rootFiles  = tree.__files as StagedFile[]
  const folderKeys = Object.keys(tree).filter(k => k !== '__files')

  return (
    <div className="space-y-4">

      {/* ── Drop zone ──────────────────────────────────────────────────────── */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-8 text-center cursor-pointer
          ${isDragging
            ? 'border-emerald-400 bg-emerald-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60'
          }`}
        onClick={() => { if (!busy) fileInputRef.current?.click() }}
      >
        <Upload className="w-9 h-9 text-slate-500 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">Drop your edited files here</p>
        <p className="text-slate-500 text-sm mb-5">
          Individual files or entire folders — folder structure will be preserved
        </p>
        <div className="flex justify-center gap-3" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm
                       text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Select Files
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => folderInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm
                       text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Select Folder
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesSelected} />
        <input
          ref={el => { folderInputRef.current = el; if (el) el.setAttribute('webkitdirectory', '') }}
          type="file"
          className="hidden"
          onChange={onFilesSelected}
        />
      </div>

      {/* ── Staged list ────────────────────────────────────────────────────── */}
      {staged.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {staged.length} file{staged.length !== 1 ? 's' : ''} ready
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-500">{fmtSize(totalSize)}</span>
            </div>
            <div className="flex items-center gap-2">
              {hasFolders && (
                <button
                  onClick={() => setShowTree(t => !t)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white
                             px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {showTree ? 'Hide' : 'Show'} tree
                </button>
              )}
              {!busy && (
                <button
                  onClick={() => { setStaged([]); setShowTree(false) }}
                  className="text-xs text-slate-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 max-h-60 overflow-y-auto">
            {hasFolders && showTree ? (
              <div className="space-y-0.5">
                {folderKeys.map(k => (
                  <StagedFolderNode key={k} name={k} node={tree[k] as StagedFolderNode} />
                ))}
                {rootFiles.map(f => (
                  <div key={f.uid} className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
                    {mimeIcon(f.file.type, 'w-3.5 h-3.5 shrink-0')}
                    <span className="truncate">{f.file.name}</span>
                    <span className="text-slate-600 shrink-0 ml-1">{fmtSize(f.file.size)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {staged.map(f => (
                  <div key={f.uid} className="flex items-center justify-between gap-2 group py-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {mimeIcon(f.file.type, 'w-3.5 h-3.5 shrink-0')}
                      <span className="text-xs text-slate-300 truncate">{f.file.name}</span>
                      {f.folderPath && (
                        <span className="text-xs text-slate-600 truncate shrink-0 hidden sm:block">
                          {f.folderPath}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-600">{fmtSize(f.file.size)}</span>
                      {!busy && (
                        <button
                          onClick={() => setStaged(p => p.filter(s => s.uid !== f.uid))}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Upload progress ────────────────────────────────────────────────── */}
      {busy && (
        <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-300">
              {uploadStatus === 'uploading'
                ? `Uploading ${progress.done} / ${progress.total}…`
                : 'Saving response…'}
            </span>
            {uploadStatus === 'uploading' && (
              <span className="text-slate-500">{Math.round((progress.done / progress.total) * 100)}%</span>
            )}
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadStatus === 'submitting' ? 100 : Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {uploadStatus === 'error' && errorMsg && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── Optional message ───────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Add a note to the admin
          <span className="text-slate-600 font-normal ml-2">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, 500))}
          disabled={busy}
          rows={3}
          placeholder="e.g. All done! Note: file 3 had lighting issues so I adjusted the exposure."
          className="w-full px-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100
                     placeholder-slate-600 focus:outline-none focus:border-slate-500 resize-none
                     disabled:opacity-50 transition-colors"
        />
        <p className="text-xs text-slate-600 mt-1 text-right">{message.length}/500</p>
      </div>

      {/* ── Submit button ──────────────────────────────────────────────────── */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl
                   bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed
                   text-white text-sm font-semibold transition-colors"
      >
        {busy ? (
          <>
            <span className="w-4 h-4 border-2 border-emerald-300 border-t-white rounded-full animate-spin" />
            {uploadStatus === 'uploading' ? `Uploading ${progress.done}/${progress.total}…` : 'Saving…'}
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit Response ({staged.length} file{staged.length !== 1 ? 's' : ''})
          </>
        )}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export: TransferDetailView
// ─────────────────────────────────────────────────────────────────────────────

export function TransferDetailView({ transfer }: { transfer: TransferDetailData }) {
  const [currentStatus,  setCurrentStatus]  = useState<TransferStatus>(transfer.status)
  const [existingResp,   setExistingResp]   = useState<TransferResponseData | null>(transfer.response)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)
  const [verifying,      setVerifying]      = useState(false)
  const [verifyDone,     setVerifyDone]     = useState(false)
  const [verifyFailed,   setVerifyFailed]   = useState(false)
  const [integrityMap,   setIntegrityMap]   = useState<Record<string, boolean | null>>({})

  const { label, cls, Icon } = STATUS_META[currentStatus]
  const senderName = transfer.sender.username ?? transfer.sender.name ?? transfer.sender.email ?? 'Admin'

  // ── Download handlers ──────────────────────────────────────────────────────

  const handleDownloadZip = useCallback(async () => {
    if (downloadingZip) return
    setDownloadingZip(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/download`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Download failed. Please try again.')
        return
      }
      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `transfer_${transfer.id}.zip`
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      // Status transitions to DOWNLOADED after first ZIP download
      if (currentStatus === 'PENDING') setCurrentStatus('DOWNLOADED')
    } catch {
      alert('Download failed. Please try again.')
    } finally {
      setDownloadingZip(false)
    }
  }, [downloadingZip, transfer.id, currentStatus])

  const handleDownloadFile = useCallback(async (file: TransferFileItem) => {
    if (downloadingFile) return
    setDownloadingFile(file.id)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/files/${file.id}`)
      if (!res.ok) { alert('Could not get download link.'); return }
      const { url, filename } = await res.json()
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click()
      // Individual file download also unlocks response
      if (currentStatus === 'PENDING') setCurrentStatus('DOWNLOADED')
    } catch {
      alert('Download failed.')
    } finally {
      setDownloadingFile(null)
    }
  }, [downloadingFile, transfer.id, currentStatus])

  const handleResponseSubmitted = useCallback((response: TransferResponseData) => {
    setExistingResp(response)
    setCurrentStatus('RESPONDED')
  }, [])

  const handleVerify = useCallback(async () => {
    if (verifying) return
    setVerifying(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/verify`)
      if (!res.ok) return
      const data = await res.json() as {
        allPassed: boolean
        transferFiles: { id: string; originalName: string; pass: boolean | null }[]
        responseFiles: { id: string; originalName: string; pass: boolean | null }[]
      }
      const map: Record<string, boolean | null> = {}
      for (const f of data.transferFiles) map[f.id] = f.pass
      for (const f of data.responseFiles)  map[f.id] = f.pass
      setIntegrityMap(map)
      setVerifyFailed(!data.allPassed)
      setVerifyDone(true)
    } catch {
      // silent — verify is optional
    } finally {
      setVerifying(false)
    }
  }, [transfer.id, verifying])

  const tree = buildFolderTree(transfer.files)

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Transfer header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-white leading-tight">{transfer.subject}</h1>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
          <div>
            <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1"><User2 className="w-3 h-3" />From</p>
            <p className="text-slate-200 truncate">{senderName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Received</p>
            <p className="text-slate-200">{format(new Date(transfer.createdAt), 'dd MMM yyyy')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Files</p>
            <p className="text-slate-200">{transfer.totalFiles} · {fmtSize(transfer.totalSize)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Expires</p>
            <p className={`${new Date(transfer.expiresAt) < new Date() ? 'text-red-400' : 'text-slate-200'}`}>
              {format(new Date(transfer.expiresAt), 'dd MMM yyyy')}
            </p>
          </div>
        </div>

        {transfer.message && (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/40">
            <p className="text-xs text-slate-500 mb-1">Message from admin</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{transfer.message}</p>
          </div>
        )}
      </div>

      {/* ── Original files ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-white">Original Files</h2>
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip || currentStatus === 'EXPIRED'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500
                       disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {downloadingZip ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download All ({transfer.totalFiles})
              </>
            )}
          </button>
        </div>

        <div className="px-5 py-4">
          <FolderTreeView
            node={tree}
            transferId={transfer.id}
            onDownloadFile={handleDownloadFile}
            downloadingFile={downloadingFile}
            integrityMap={verifyDone ? integrityMap : undefined}
          />
        </div>
      </div>

      {/* ── Response section ──────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Send Your Edited Files Back</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Upload your edited versions below. The admin will be notified when you submit.
          </p>
        </div>

        <ResponseSection
          transferId={transfer.id}
          currentStatus={currentStatus}
          existingResponse={existingResp}
          onSubmitted={handleResponseSubmitted}
        />
      </div>
      {/* ── Transfer Integrity ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Transfer Integrity
          </h2>
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {verifying
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</>
              : verifyDone ? <><ShieldCheck className="w-3.5 h-3.5" /> Re-verify</> : <><ShieldCheck className="w-3.5 h-3.5" /> Verify from Storage</>
            }
          </button>
        </div>

        {!verifyDone && (
          <p className="text-xs text-slate-500 leading-relaxed">
            SHA-256 checksums are stored at upload time to guarantee the files you
            received are byte‑for‑byte identical to what was sent. Click “Verify”
            to re‑confirm against current R2 storage.
          </p>
        )}

        {verifyDone && !verifyFailed && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300 font-medium">
              All {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} verified — original quality confirmed ✓
            </p>
          </div>
        )}

        {verifyDone && verifyFailed && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-300 font-medium">
                ⚠️ One or more files may have been altered during storage.
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Files marked with “Issue” did not match their stored checksum.
                Please contact the admin immediately.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
