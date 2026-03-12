'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, X, FolderOpen, ChevronDown, ChevronRight, FileText, Film,
  Image as ImageIcon, File as FileIcon, Send, User, Search,
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, WifiOff,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface StagedFile {
  uid:        string
  file:       File
  folderPath: string | null   // relative folder path, null = top-level
}

interface RecipientUser {
  id:       string
  username: string | null
  name:     string | null
  email:    string
  role:     string
}

// Saved after all R2 uploads succeed — lets us retry the DB-create step
// without re-uploading if the network drops just before the final POST.
interface PendingTransfer {
  id:             string
  recipientId:    string
  recipientLabel: string   // display name for the banner
  subject:        string
  message:        string | null
  files:          {
    originalName: string; r2Key: string; fileSize: number
    mimeType: string; folderPath: string | null; checksum: string
  }[]
  totalFiles:      number
  totalSize:       number
  folderStructure: Record<string, string[]> | null
}

const PENDING_KEY = 'cmms_pending_transfer'

// ─── Constants ───────────────────────────────────────────────────────────────
const WARN_SIZE = 2 * 1024 * 1024 * 1024  // 2 GB

const ACCEPTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.raw', '.heic',
  '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2',
  '.mp4', '.mov', '.avi',
  '.pdf', '.docx', '.xlsx', '.pptx', '.ai', '.psd',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isAccepted(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  return ACCEPTED_EXTENSIONS.has(ext)
}

async function computeSHA256(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function FileTypeIcon({ file }: { file: File }) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg','jpeg','png','tiff','tif','raw','heic','cr2','nef','arw','dng','orf','rw2'].includes(ext))
    return <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
  if (['mp4','mov','avi'].includes(ext))
    return <Film className="w-4 h-4 text-purple-400 shrink-0" />
  if (['pdf','docx','xlsx','pptx','ai','psd'].includes(ext))
    return <FileText className="w-4 h-4 text-orange-400 shrink-0" />
  return <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
}

// Recursively read a dropped FileSystemEntry (file or directory) with paths
async function collectFromEntry(
  entry: FileSystemEntry,
  basePath = '',
): Promise<{ file: File; folderPath: string | null }[]> {
  if (entry.isFile) {
    return new Promise(resolve => {
      ;(entry as FileSystemFileEntry).file(f =>
        resolve([{ file: f, folderPath: basePath || null }]),
      )
    })
  }
  if (entry.isDirectory) {
    const subPath  = basePath ? `${basePath}/${entry.name}` : entry.name
    const reader   = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries may return results in batches — keep reading until empty
    const allEntries: FileSystemEntry[] = []
    await new Promise<void>((resolve, reject) => {
      const readBatch = () =>
        reader.readEntries(batch => {
          if (batch.length === 0) { resolve(); return }
          allEntries.push(...batch)
          readBatch()
        }, reject)
      readBatch()
    })
    const nested = await Promise.all(allEntries.map(e => collectFromEntry(e, subPath)))
    return nested.flat()
  }
  return []
}

// ─── Folder tree sub-component ────────────────────────────────────────────────
interface TreeNode {
  __files: StagedFile[]
  [key: string]: TreeNode | StagedFile[]
}

function buildTree(files: StagedFile[]): TreeNode {
  const root = { __files: [] as StagedFile[] } as TreeNode
  for (const f of files) {
    if (!f.folderPath) { root.__files.push(f); continue }
    const parts = f.folderPath.split('/')
    let node = root
    for (const part of parts) {
      if (!node[part]) (node[part] as TreeNode) = { __files: [] }
      node = node[part] as TreeNode
    }
    node.__files.push(f)
  }
  return root
}

function countFiles(node: TreeNode): number {
  const kids = Object.keys(node).filter(k => k !== '__files') as string[]
  return node.__files.length + kids.reduce((s, k) => s + countFiles(node[k] as TreeNode), 0)
}

function FolderNode({ name, node, depth = 0 }: { name: string; node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  const childKeys = Object.keys(node).filter(k => k !== '__files')
  const total     = countFiles(node)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white py-0.5 w-full text-left"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {open
          ? <ChevronDown  className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />}
        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span className="font-medium truncate">{name}</span>
        <span className="text-slate-500 text-xs ml-1 shrink-0">
          ({total} file{total !== 1 ? 's' : ''})
        </span>
      </button>

      {open && (
        <div>
          {childKeys.map(k => (
            <FolderNode key={k} name={k} node={node[k] as TreeNode} depth={depth + 1} />
          ))}
          {node.__files.map(f => (
            <div
              key={f.uid}
              className="flex items-center gap-1.5 text-xs text-slate-400 py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
            >
              <FileTypeIcon file={f.file} />
              <span className="truncate">{f.file.name}</span>
              <span className="text-slate-600 shrink-0 ml-1">{formatBytes(f.file.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function NewTransferForm() {
  const router = useRouter()

  // Files
  const dropRef        = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [staged,      setStaged]      = useState<StagedFile[]>([])
  const [isDragging,  setIsDragging]  = useState(false)
  const [showTree,    setShowTree]    = useState(false)

  // Form
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  // Recipient
  const [recipientSearch, setRecipientSearch] = useState('')
  const [searchResults,   setSearchResults]   = useState<RecipientUser[]>([])
  const [recipient,       setRecipient]       = useState<RecipientUser | null>(null)
  const [searchLoading,   setSearchLoading]   = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send flow
  const [sendStatus, setSendStatus] = useState<'idle' | 'uploading' | 'creating' | 'done' | 'error'>('idle')
  const [progress,   setProgress]   = useState({ done: 0, total: 0 })
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)

  // Pending transfer (saved after all R2 uploads, in case network drops before DB create)
  const [pendingCreate, setPendingCreate] = useState<PendingTransfer | null>(null)

  // Load any pending transfer that was interrupted
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PENDING_KEY)
      if (saved) setPendingCreate(JSON.parse(saved) as PendingTransfer)
    } catch { /* ignore corrupt data */ }
  }, [])

  // Derived
  const totalSize = staged.reduce((s, f) => s + f.file.size, 0)
  const hasFolders = staged.some(f => f.folderPath)
  const canSend    = staged.length > 0 && !!recipient && subject.trim().length > 0 && sendStatus === 'idle'

  // ── Ingest files ─────────────────────────────────────────────────────────
  function ingest(incoming: { file: File; folderPath: string | null }[]) {
    const valid = incoming.filter(({ file }) => isAccepted(file))
    if (!valid.length) return
    setStaged(prev => {
      const existing = new Set(prev.map(f => `${f.file.name}|${f.file.size}|${f.folderPath ?? ''}`))
      const fresh = valid
        .filter(({ file, folderPath }) =>
          !existing.has(`${file.name}|${file.size}|${folderPath ?? ''}`))
        .map(({ file, folderPath }) => ({ uid: crypto.randomUUID(), file, folderPath }))
      return [...prev, ...fresh]
    })
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items)
    const collected: { file: File; folderPath: string | null }[] = []
    await Promise.all(items.map(async item => {
      if (item.kind !== 'file') return
      const entry = item.webkitGetAsEntry()
      if (!entry) return
      const files = await collectFromEntry(entry, '')
      collected.push(...files)
    }))
    ingest(collected)
  // ingest is stable (only calls setStaged)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File / folder picker ─────────────────────────────────────────────────
  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    const files = Array.from(e.target.files).map(f => ({
      file: f,
      folderPath: f.webkitRelativePath
        ? f.webkitRelativePath.split('/').slice(0, -1).join('/') || null
        : null,
    }))
    ingest(files)
    e.target.value = ''
  }

  // ── Recipient search ─────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current ?? undefined)
    if (recipientSearch.trim().length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/users/search?q=${encodeURIComponent(recipientSearch.trim())}`)
        const data = await res.json()
        setSearchResults(data.users ?? [])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(searchTimer.current ?? undefined)
  }, [recipientSearch])

  // ── Send ─────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!canSend || !recipient) return

    // Check network before we start
    if (!navigator.onLine) {
      setErrorMsg('You are offline. Please reconnect and try again.')
      setSendStatus('error')
      return
    }

    const transferId = crypto.randomUUID()
    setSendStatus('uploading')
    setProgress({ done: 0, total: staged.length })
    setErrorMsg(null)

    try {
      const uploadedFiles: PendingTransfer['files'] = []

      for (const sf of staged) {
        // 1. Get presigned URL from server
        const presignRes = await fetch('/api/transfers/presign', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            transferId,
            filename:    sf.file.name,
            folderPath:  sf.folderPath,
            contentType: sf.file.type || 'application/octet-stream',
          }),
        })
        if (!presignRes.ok) throw new Error(`Could not presign ${sf.file.name}`)
        const { presignedUrl, r2Key } = await presignRes.json()

        // 2. Compute SHA-256 (guarantees byte-for-byte integrity on download)
        const checksum = await computeSHA256(sf.file)

        // 3. PUT directly to R2 — no compression, no resampling
        const putRes = await fetch(presignedUrl, {
          method:  'PUT',
          body:    sf.file,
          headers: { 'Content-Type': sf.file.type || 'application/octet-stream' },
        })
        if (!putRes.ok) throw new Error(`Upload failed for ${sf.file.name}`)

        uploadedFiles.push({
          originalName: sf.file.name,
          r2Key,
          fileSize:     sf.file.size,
          mimeType:     sf.file.type || 'application/octet-stream',
          folderPath:   sf.folderPath,
          checksum,
        })
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }

      // All files are safely in R2. Persist the create payload so we can retry
      // if the network drops before the DB write completes.
      const pending: PendingTransfer = {
        id:              transferId,
        recipientId:     recipient.id,
        recipientLabel:  recipient.username ?? recipient.name ?? recipient.email,
        subject:         subject.trim(),
        message:         message.trim() || null,
        files:           uploadedFiles,
        totalFiles:      staged.length,
        totalSize:       totalSize,
        folderStructure: hasFolders ? buildFolderStructureJson(staged) : null,
      }
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
      setPendingCreate(pending)

      // 4. Create transfer record in DB
      await finishTransferCreate(pending)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed. Please try again.'
      setErrorMsg(msg)
      setSendStatus('error')
    }
  }

  // ── Retry just the DB-create step (files already in R2) ──────────────────
  async function retryPendingCreate() {
    if (!pendingCreate) return
    if (!navigator.onLine) {
      setErrorMsg('Still offline. Please reconnect and try again.')
      setSendStatus('error')
      return
    }
    setSendStatus('creating')
    setErrorMsg(null)
    try {
      await finishTransferCreate(pendingCreate)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Retry failed. Please try again.')
      setSendStatus('error')
    }
  }

  async function finishTransferCreate(pending: PendingTransfer) {
    setSendStatus('creating')
    const createRes = await fetch('/api/transfers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id:              pending.id,
        recipientId:     pending.recipientId,
        subject:         pending.subject,
        message:         pending.message,
        files:           pending.files,
        totalFiles:      pending.totalFiles,
        totalSize:       pending.totalSize,
        folderStructure: pending.folderStructure,
      }),
    })
    if (!createRes.ok) throw new Error('Failed to save transfer record — your files are safe, please retry.')

    localStorage.removeItem(PENDING_KEY)
    setPendingCreate(null)
    setSendStatus('done')
  }

  function buildFolderStructureJson(files: StagedFile[]) {
    const map: Record<string, string[]> = {}
    files.forEach(f => {
      const key = f.folderPath ?? '(root)'
      if (!map[key]) map[key] = []
      map[key].push(f.file.name)
    })
    return map
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const tree     = buildTree(staged)
  const rootFiles: StagedFile[] = tree.__files
  const folderKeys = Object.keys(tree).filter(k => k !== '__files')
  const busy = sendStatus === 'uploading' || sendStatus === 'creating'

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Offline / interrupted transfer recovery banner ────────────────── */}
      {pendingCreate && sendStatus === 'idle' && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-2xl
                        bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <WifiOff className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Interrupted transfer detected</p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Files were uploaded to &ldquo;{pendingCreate.subject}&rdquo; for{' '}
              <span className="font-medium">{pendingCreate.recipientLabel}</span> but the
              transfer record could not be saved. Your files are safe.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={retryPendingCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-amber-500 hover:bg-amber-400 text-amber-950 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
            <button
              onClick={() => { localStorage.removeItem(PENDING_KEY); setPendingCreate(null) }}
              className="text-xs text-amber-500/70 hover:text-amber-300 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center cursor-pointer
          ${isDragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60'
          }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <p className="text-slate-300 font-medium text-lg mb-1">
          Drop files or a folder here
        </p>
        <p className="text-slate-500 text-sm mb-6 max-w-lg mx-auto">
          Photos (JPG, PNG, RAW, HEIC, TIFF) · Videos (MP4, MOV, AVI) · Documents (PDF, DOCX, XLSX, PPTX, AI, PSD)
        </p>
        <div className="flex justify-center gap-3" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm
                       text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Select Files
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm
                       text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Select Folder
          </button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFilesSelected}
        />
        <input
          ref={el => {
            folderInputRef.current = el
            if (el) el.setAttribute('webkitdirectory', '')
          }}
          type="file"
          className="hidden"
          onChange={onFilesSelected}
        />
      </div>

      {/* ── Large-transfer warning ────────────────────────────────────────── */}
      {totalSize > WARN_SIZE && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Large transfer ({formatBytes(totalSize)}) — recipient download may take time on slow connections.
          </span>
        </div>
      )}

      {/* ── Staged file list ──────────────────────────────────────────────── */}
      {staged.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          {/* List header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {staged.length} file{staged.length !== 1 ? 's' : ''} staged
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-500">{formatBytes(totalSize)} total</span>
            </div>
            <div className="flex items-center gap-2">
              {hasFolders && (
                <button
                  onClick={() => setShowTree(t => !t)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white
                             px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {showTree ? 'Hide' : 'Show'} folder tree
                </button>
              )}
              <button
                onClick={() => { setStaged([]); setShowTree(false) }}
                className="text-xs text-slate-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Folder tree */}
          {showTree && hasFolders && (
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40">
              {folderKeys.map(k => (
                <FolderNode key={k} name={k} node={tree[k] as TreeNode} />
              ))}
              {rootFiles.map(f => (
                <div key={f.uid} className="flex items-center gap-1.5 text-xs text-slate-400 py-0.5 pl-1">
                  <FileTypeIcon file={f.file} />
                  <span className="truncate">{f.file.name}</span>
                  <span className="text-slate-600 ml-1">{formatBytes(f.file.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Flat file rows */}
          <div className="divide-y divide-slate-800/50 max-h-72 overflow-y-auto">
            {staged.map(s => (
              <div key={s.uid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 group">
                <FileTypeIcon file={s.file} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{s.file.name}</p>
                  {s.folderPath && (
                    <p className="text-xs text-slate-500 truncate">{s.folderPath}/</p>
                  )}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{formatBytes(s.file.size)}</span>
                <button
                  onClick={() => setStaged(prev => prev.filter(f => f.uid !== s.uid))}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded
                             text-slate-500 hover:text-red-400 hover:bg-slate-700 shrink-0"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transfer details form ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
        <h2 className="text-base font-semibold text-white">Transfer Details</h2>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Subject <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            maxLength={100}
            placeholder='e.g. "Saturday Fellowship Photos — March 2026"'
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white
                       placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500
                       focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
          <p className="text-xs text-slate-600 mt-1 text-right">{subject.length}/100</p>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Message to recipient <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            maxLength={500}
            rows={3}
            placeholder='e.g. "Please edit and return by Friday"'
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white
                       placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500
                       focus:ring-1 focus:ring-indigo-500/30 transition-colors resize-none"
          />
          <p className="text-xs text-slate-600 mt-1 text-right">{message.length}/500</p>
        </div>

        {/* Recipient */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Recipient <span className="text-red-400">*</span>
          </label>

          {recipient ? (
            /* Selected chip */
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/40">
              <User className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {recipient.username ?? recipient.name ?? recipient.email}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {recipient.email} · <span className="font-medium">{recipient.role}</span>
                </p>
              </div>
              <button
                onClick={() => setRecipient(null)}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                title="Remove recipient"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Search input */
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={recipientSearch}
                  onChange={e => setRecipientSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white
                             placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500
                             focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin pointer-events-none" />
                )}
              </div>

              {/* Dropdown results */}
              {searchResults.length > 0 && (
                <div className="absolute z-20 mt-1.5 w-full rounded-xl bg-slate-800 border border-slate-700
                                shadow-2xl shadow-black/40 overflow-hidden">
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setRecipient(u); setRecipientSearch(''); setSearchResults([]) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 text-left transition-colors"
                    >
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {u.username ?? u.name ?? u.email}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {u.email} · {u.role}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {sendStatus === 'error' && errorMsg && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span>{errorMsg}</span>
            {/* If files made it to R2 but the DB create failed, offer inline retry */}
            {pendingCreate && (
              <button
                onClick={() => { setSendStatus('idle'); retryPendingCreate() }}
                className="ml-3 underline text-amber-400 hover:text-amber-300 text-xs"
              >
                Retry now
              </button>
            )}
          </div>
          <button
            onClick={() => setSendStatus('idle')}
            className="p-0.5 text-red-400/60 hover:text-red-300 shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {sendStatus === 'done' && (
        <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-3 text-emerald-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Transfer sent successfully!</p>
              <p className="text-xs text-emerald-400/70 mt-0.5">
                {staged.length} file{staged.length !== 1 ? 's' : ''} delivered to {recipient?.username ?? recipient?.name ?? recipient?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            Go to Dashboard
          </button>
        </div>
      )}

      {/* ── Send button row ───────────────────────────────────────────────── */}
      {sendStatus !== 'done' && (
        <div className="flex items-center justify-between pt-1">
          {/* Progress indicator */}
          {busy && (
            <p className="text-sm text-slate-400">
              {sendStatus === 'uploading'
                ? `Uploading ${progress.done} / ${progress.total} files…`
                : 'Saving transfer record…'}
            </p>
          )}
          {!busy && <span />}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all
              ${canSend
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
          >
            {busy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
            {sendStatus === 'uploading' ? `${progress.done} / ${progress.total}`
              : sendStatus === 'creating' ? 'Saving…'
              : 'Send Transfer'}
          </button>
        </div>
      )}
    </div>
  )
}
