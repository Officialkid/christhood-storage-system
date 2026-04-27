'use client'

import { useState, useCallback } from 'react'
import {
  Download, FileText, Image as ImageIcon, Video as VideoIcon, Music,
  File as FileIcon, Folder, ChevronDown, ChevronRight,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, CheckCheck, X, Ban, Send, MessageSquare,
  CalendarDays, AlertTriangle, ShieldCheck, ShieldAlert, Loader2,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

interface TransferFileItem {
  id:           string
  originalName: string
  fileSize:     number
  mimeType:     string
  folderPath:   string | null
  checksum:     string
}

interface ResponseFileItem {
  id:           string
  originalName: string
  fileSize:     number
  mimeType:     string
  folderPath:   string | null
  checksum:     string
}

interface ResponseData {
  id:                string
  message:           string | null
  totalFiles:        number
  totalSize:         number
  downloadedByAdmin: boolean
  createdAt:         string
  files:             ResponseFileItem[]
}

export interface SentTransferDetailData {
  id:         string
  subject:    string
  message:    string | null
  status:     TransferStatus
  totalFiles: number
  totalSize:  number
  expiresAt:  string
  createdAt:  string
  updatedAt:  string
  recipient: {
    id:       string
    username: string | null
    name:     string | null
    email:    string
    role:     string
  }
  files:    TransferFileItem[]
  response: ResponseData | null
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

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
  if (mimeType.startsWith('video/')) return <VideoIcon  className="w-4 h-4 text-purple-400 shrink-0" />
  if (mimeType.startsWith('audio/')) return <Music      className="w-4 h-4 text-pink-400 shrink-0" />
  if (mimeType === 'application/pdf') return <FileText   className="w-4 h-4 text-red-400 shrink-0" />
  return <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
}

const STATUS_META: Record<
  TransferStatus,
  { label: string; cls: string; Icon: React.FC<{ className?: string }> }
> = {
  PENDING:    { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',       Icon: Clock        },
  DOWNLOADED: { label: 'Downloaded',        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',         Icon: CheckCircle2 },
  RESPONDED:  { label: 'Response Sent',     cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw   },
  COMPLETED:  { label: 'Completed',         cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',       Icon: Archive      },
  EXPIRED:    { label: 'Expired',           cls: 'bg-red-500/20 text-red-400 border border-red-500/30',             Icon: AlertCircle  },
}

// ─────────────────────────────────────────────────────────────────────────────
// FolderNode tree (for folder-aware file list display)
// ─────────────────────────────────────────────────────────────────────────────

interface FolderNode {
  name:     string
  children: Map<string, FolderNode>
  files:    (TransferFileItem | ResponseFileItem)[]
}

function buildFolderTree(files: (TransferFileItem | ResponseFileItem)[]): FolderNode {
  const root: FolderNode = { name: '', children: new Map(), files: [] }
  for (const f of files) {
    if (!f.folderPath) { root.files.push(f); continue }
    const parts = f.folderPath.replace(/^\/|\/$/g, '').split('/')
    let node = root
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), files: [] })
      }
      node = node.children.get(part)!
    }
    node.files.push(f)
  }
  return root
}

// ─────────────────────────────────────────────────────────────────────────────
// FileRow — individual file with hover download button
// ─────────────────────────────────────────────────────────────────────────────

function FileRow({
  file,
  onDownload,
  downloading,
  integrityPass,
}: {
  file:           TransferFileItem | ResponseFileItem
  onDownload:     (fileId: string, filename: string) => void
  downloading:    boolean
  integrityPass?: boolean | null
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 group">
      <div className="flex items-center gap-2 min-w-0">
        {fileIcon(file.mimeType)}
        <span className="text-xs text-slate-300 truncate">{file.originalName}</span>
        <span className="text-xs text-slate-600 shrink-0">{fmtSize(file.fileSize)}</span>
        {integrityPass === true  && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 shrink-0">
            <ShieldCheck className="w-3 h-3" />Verified
          </span>
        )}
        {integrityPass === false && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400 shrink-0">
            <ShieldAlert className="w-3 h-3" />Issue
          </span>
        )}
      </div>
      <button
        onClick={() => onDownload(file.id, file.originalName)}
        disabled={downloading}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 transition-all text-slate-400 hover:text-white disabled:opacity-50"
        title="Download file"
      >
        {downloading
          ? <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-white rounded-full animate-spin block" />
          : <Download className="w-3.5 h-3.5" />
        }
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FolderTreeNode — recursive folder renderer
// ─────────────────────────────────────────────────────────────────────────────

function FolderTreeNode({
  node,
  onDownloadFile,
  downloadingFile,
  integrityMap,
}: {
  node:            FolderNode
  onDownloadFile:  (fileId: string, filename: string) => void
  downloadingFile: string | null
  integrityMap?:   Record<string, boolean | null>
}) {
  const [open, setOpen] = useState(true)
  if (node.children.size === 0 && node.files.length === 0) return null

  return (
    <div>
      {node.name && (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white text-xs py-1 w-full text-left"
        >
          {open
            ? <ChevronDown  className="w-3.5 h-3.5 shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          }
          <Folder className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {(!node.name || open) && (
        <div className={node.name ? 'ml-4 border-l border-slate-700/50 pl-3' : ''}>
          {node.files.map(f => (
            <FileRow
              key={f.id}
              file={f}
              onDownload={onDownloadFile}
              downloading={downloadingFile === f.id}
              integrityPass={integrityMap ? (integrityMap[f.id] ?? null) : undefined}
            />
          ))}
          {Array.from(node.children.values()).map(child => (
            <FolderTreeNode
              key={child.name}
              node={child}
              onDownloadFile={onDownloadFile}
              downloadingFile={downloadingFile}
              integrityMap={integrityMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineItem
// ─────────────────────────────────────────────────────────────────────────────

function TimelineItem({
  label,
  timestamp,
  done,
  isFuture,
}: {
  label:     string
  timestamp: string | null
  done:      boolean
  isFuture?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
        done
          ? 'bg-emerald-500/20 border-emerald-500/50'
          : isFuture
            ? 'bg-slate-800 border-slate-600'
            : 'bg-slate-800 border-slate-700'
      }`}>
        {done && <CheckCheck className="w-2.5 h-2.5 text-emerald-400" />}
      </div>
      <div className="min-w-0 pb-4">
        <p className={`text-sm font-medium ${done ? 'text-slate-200' : isFuture ? 'text-slate-400' : 'text-slate-500'}`}>
          {label}
        </p>
        {timestamp && (
          <p className="text-xs text-slate-500 mt-0.5">
            {format(new Date(timestamp), 'dd MMM yyyy, HH:mm')}
            <span className="text-slate-600 ml-2">
              ({formatDistanceToNow(new Date(timestamp), { addSuffix: true })})
            </span>
          </p>
        )}
        {!timestamp && !isFuture && !done && (
          <p className="text-xs text-slate-600 mt-0.5">—</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component — SentTransferDetail
// ─────────────────────────────────────────────────────────────────────────────

export function SentTransferDetail({ transfer }: { transfer: SentTransferDetailData }) {
  const [currentStatus,    setCurrentStatus]    = useState<TransferStatus>(transfer.status)
  const [existingResponse, setExistingResponse] = useState<ResponseData | null>(transfer.response)
  const [downloadingOrigZip,  setDownloadingOrigZip]  = useState(false)
  const [downloadingOrigFile, setDownloadingOrigFile] = useState<string | null>(null)
  const [downloadingRespZip,  setDownloadingRespZip]  = useState(false)
  const [downloadingRespFile, setDownloadingRespFile] = useState<string | null>(null)
  const [completing,    setCompleting]    = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [cancelling,    setCancelling]    = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError,   setCancelError]   = useState<string | null>(null)
  const [verifying,     setVerifying]     = useState(false)
  const [verifyDone,    setVerifyDone]    = useState(false)
  const [verifyFailed,  setVerifyFailed]  = useState(false)
  const [integrityMap,  setIntegrityMap]  = useState<Record<string, boolean | null>>({})

  const { label, cls, Icon } = STATUS_META[currentStatus]
  const recipientLabel = transfer.recipient.username ?? transfer.recipient.name ?? transfer.recipient.email
  const roleLabel = transfer.recipient.role.charAt(0) + transfer.recipient.role.slice(1).toLowerCase()

  // ── Download original files ZIP ──────────────────────────────────────────
    const handleDownloadOriginals = useCallback(() => {
      if (downloadingOrigZip) return
      setDownloadingOrigZip(true)

      const a = document.createElement('a')
      a.href = `/api/transfers/${transfer.id}/download`
      a.rel = 'noopener noreferrer'
      a.click()

      setTimeout(() => setDownloadingOrigZip(false), 1200)
    }, [transfer.id, downloadingOrigZip])

  // ── Download individual original file ────────────────────────────────────
  const handleDownloadOrigFile = useCallback(async (fileId: string, filename: string) => {
    if (downloadingOrigFile) return
    setDownloadingOrigFile(fileId)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/files/${fileId}`)
      if (!res.ok) { alert('Could not get download link.'); return }
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click()
    } catch {
      alert('Download failed.')
    } finally {
      setDownloadingOrigFile(null)
    }
  }, [transfer.id, downloadingOrigFile])

  // ── Download response files ZIP ──────────────────────────────────────────
    const handleDownloadResponseZip = useCallback(() => {
      if (downloadingRespZip) return
      setDownloadingRespZip(true)

      const a = document.createElement('a')
      a.href = `/api/transfers/${transfer.id}/response/download`
      a.rel = 'noopener noreferrer'
      a.click()

      setTimeout(() => setDownloadingRespZip(false), 1200)
    }, [transfer.id, downloadingRespZip])

  // ── Download individual response file ────────────────────────────────────
  const handleDownloadRespFile = useCallback(async (fileId: string, filename: string) => {
    if (downloadingRespFile) return
    setDownloadingRespFile(fileId)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/response/files/${fileId}`)
      if (!res.ok) { alert('Could not get download link.'); return }
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click()
    } catch {
      alert('Download failed.')
    } finally {
      setDownloadingRespFile(null)
    }
  }, [transfer.id, downloadingRespFile])

  // ── Mark as Completed ────────────────────────────────────────────────────
  const handleMarkComplete = useCallback(async () => {
    if (completing) return
    setCompleting(true)
    setCompleteError(null)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/complete`, { method: 'PATCH' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setCompleteError(d.error ?? 'Could not complete transfer. Please try again.')
        return
      }
      setCurrentStatus('COMPLETED')
      setExistingResponse(r => r ? { ...r, downloadedByAdmin: true } : r)
    } catch {
      setCompleteError('Network error. Please try again.')
    } finally {
      setCompleting(false)
    }
  }, [transfer.id, completing])

  // ── Cancel transfer ──────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/cancel`, { method: 'PATCH' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setCancelError(d.error ?? 'Could not cancel transfer. Please try again.')
        setCancelling(false)
        return
      }
      setCurrentStatus('EXPIRED')
      setConfirmCancel(false)
    } catch {
      setCancelError('Network error. Please try again.')
    } finally {
      setCancelling(false)
    }
  }, [transfer.id, cancelling])

  // ── Verify integrity from R2 ─────────────────────────────────────────────────────────
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

  const origTree = buildFolderTree(transfer.files)
  const respTree = existingResponse ? buildFolderTree(existingResponse.files) : null

  const showResponse = currentStatus === 'RESPONDED' || currentStatus === 'COMPLETED'

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Header card ───────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight mb-1">{transfer.subject}</h1>
            <p className="text-xs text-slate-500">Transfer ID: {transfer.id}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Sent to</p>
            <div className="flex items-center gap-1.5">
              <User2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-200 truncate text-xs">{recipientLabel}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{roleLabel}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Sent</p>
            <p className="text-slate-200 text-xs">{format(new Date(transfer.createdAt), 'dd MMM yyyy')}</p>
            <p className="text-xs text-slate-500">{format(new Date(transfer.createdAt), 'HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Files sent</p>
            <p className="text-slate-200 text-xs">{transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''}</p>
            <p className="text-xs text-slate-500">{fmtSize(transfer.totalSize)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Expires</p>
            <p className="text-slate-200 text-xs">{format(new Date(transfer.expiresAt), 'dd MMM yyyy')}</p>
            <p className="text-xs text-slate-500">{formatDistanceToNow(new Date(transfer.expiresAt), { addSuffix: true })}</p>
          </div>
        </div>

        {transfer.message && (
          <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/40">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Your message to recipient
            </p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{transfer.message}</p>
          </div>
        )}
      </div>

      {/* ── Section 1: Files You Sent ────────────────────────────────────── */}
      <section className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Files You Sent</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} · {fmtSize(transfer.totalSize)}
            </p>
          </div>
          <button
            onClick={handleDownloadOriginals}
            disabled={downloadingOrigZip || currentStatus === 'EXPIRED'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-xs font-medium transition-colors"
          >
            {downloadingOrigZip ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Re-download Originals
              </>
            )}
          </button>
        </div>

        <FolderTreeNode
          node={origTree}
          onDownloadFile={handleDownloadOrigFile}
          downloadingFile={downloadingOrigFile}
          integrityMap={verifyDone ? integrityMap : undefined}
        />
      </section>

      {/* ── Section 2: Response Files ────────────────────────────────────── */}
      {showResponse && existingResponse && respTree && (
        <section className="rounded-xl border p-5 bg-emerald-500/5 border-emerald-500/20">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-emerald-400" />
                Response Files
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Received {formatDistanceToNow(new Date(existingResponse.createdAt), { addSuffix: true })} ·&nbsp;
                {existingResponse.totalFiles} file{existingResponse.totalFiles !== 1 ? 's' : ''} · {fmtSize(existingResponse.totalSize)}
              </p>
            </div>
          </div>

          {/* Recipient message */}
          {existingResponse.message && (
            <div className="my-4 p-3 rounded-lg bg-slate-900/50 border border-emerald-500/20">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-emerald-400" />
                Recipient&apos;s note
              </p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{existingResponse.message}</p>
            </div>
          )}

          {/* Response submission timestamp */}
          <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
            <Send className="w-3 h-3" />
            Submitted on {format(new Date(existingResponse.createdAt), 'dd MMM yyyy, HH:mm')}
          </p>

          {/* Response file tree */}
          <div className="mb-4">
            <FolderTreeNode
              node={respTree}
              onDownloadFile={handleDownloadRespFile}
              downloadingFile={downloadingRespFile}
              integrityMap={verifyDone ? integrityMap : undefined}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-emerald-500/20">
            <button
              onClick={handleDownloadResponseZip}
              disabled={downloadingRespZip}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {downloadingRespZip ? (
                <>
                  <span className="w-4 h-4 border-2 border-emerald-300 border-t-white rounded-full animate-spin" />
                  Preparing ZIP…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Response as ZIP
                </>
              )}
            </button>

            {currentStatus === 'RESPONDED' && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleMarkComplete}
                  disabled={completing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {completing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                      Marking complete…
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4" />
                      Mark as Completed
                    </>
                  )}
                </button>
                {completeError && (
                  <p className="text-xs text-red-400">{completeError}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Cancel (PENDING only) ─────────────────────────────────────────── */}
      {currentStatus === 'PENDING' && (
        <section className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-5">
          <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <Ban className="w-4 h-4" />
            Cancel Transfer
          </h2>
          {!confirmCancel ? (
            <div>
              <p className="text-xs text-slate-500 mb-3">
                Cancelling will immediately delete all uploaded files from storage and notify the recipient.
                This cannot be undone.
              </p>
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel this transfer
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-300 font-medium mb-1 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Confirm cancellation
              </p>
              <p className="text-xs text-slate-400 mb-4">
                All {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} will be permanently deleted from storage
                and the recipient will be notified. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                >
                  {cancelling ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin" />
                      Cancelling…
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" />
                      Yes, cancel transfer
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setConfirmCancel(false); setCancelError(null) }}
                  disabled={cancelling}
                  className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
                >
                  Keep it
                </button>
              </div>
              {cancelError && <p className="text-xs text-red-400 mt-2">{cancelError}</p>}
            </div>
          )}
        </section>
      )}

      {/* ── Section 3: Timeline ──────────────────────────────────────────── */}
      <section className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-5">
        <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Timeline
        </h2>
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[9px] top-5 bottom-5 w-px bg-slate-700/50" />

          <div className="space-y-0">
            <TimelineItem
              label="Transfer sent"
              timestamp={transfer.createdAt}
              done
            />
            <TimelineItem
              label="Downloaded by recipient"
              timestamp={null}
              done={currentStatus !== 'PENDING' && currentStatus !== 'EXPIRED'}
            />
            <TimelineItem
              label="Response received"
              timestamp={existingResponse?.createdAt ?? null}
              done={!!(existingResponse)}
            />
            <TimelineItem
              label="Completed"
              timestamp={currentStatus === 'COMPLETED' ? transfer.updatedAt : null}
              done={currentStatus === 'COMPLETED'}
            />
            <TimelineItem
              label={`Expires${currentStatus === 'EXPIRED' ? ' (expired)' : ''}`}
              timestamp={transfer.expiresAt}
              done={currentStatus === 'EXPIRED'}
              isFuture={currentStatus !== 'EXPIRED'}
            />
          </div>
        </div>
      </section>

      {/* ── Transfer Integrity ───────────────────────────────────────────────── */}
      <section className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 flex items-center gap-2">
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
            SHA-256 checksums are computed and stored at upload time, ensuring
            byte‑for‑byte fidelity. Click “Verify from Storage” to re‑download
            and confirm every file matches its stored checksum.
          </p>
        )}

        {verifyDone && !verifyFailed && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300 font-medium">
              All {transfer.totalFiles + (existingResponse?.totalFiles ?? 0)} file{(transfer.totalFiles + (existingResponse?.totalFiles ?? 0)) !== 1 ? 's' : ''} verified — original quality confirmed ✓
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
                Please contact the system administrator to investigate.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
