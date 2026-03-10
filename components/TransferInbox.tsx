'use client'

import { useState, useCallback } from 'react'
import {
  Inbox, ChevronDown, ChevronRight, Download, File, Folder,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, FileText, Image, Video, Music,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

// ─────────────────── Types ───────────────────────────────────────────────────

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

interface TransferFileItem {
  id: string
  originalName: string
  fileSize: number
  mimeType: string
  folderPath: string | null
}

interface TransferItem {
  id: string
  subject: string
  message: string | null
  status: TransferStatus
  totalFiles: number
  totalSize: number
  expiresAt: Date | string
  createdAt: Date | string
  sender: { id: string; username: string | null; name: string | null; email: string | null }
  files: TransferFileItem[]
}

interface Props {
  transfers: TransferItem[]
}

// ─────────────────── Helpers ─────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function senderInitials(sender: TransferItem['sender']): string {
  const name = sender.username ?? sender.name ?? sender.email ?? '?'
  return name.slice(0, 2).toUpperCase()
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="w-4 h-4 text-blue-400 shrink-0" />
  if (mimeType.startsWith('video/')) return <Video className="w-4 h-4 text-purple-400 shrink-0" />
  if (mimeType.startsWith('audio/')) return <Music className="w-4 h-4 text-pink-400 shrink-0" />
  if (mimeType === 'application/pdf') return <FileText className="w-4 h-4 text-red-400 shrink-0" />
  return <File className="w-4 h-4 text-slate-400 shrink-0" />
}

const STATUS_META: Record<TransferStatus, { label: string; cls: string; Icon: React.FC<{className?: string}> }> = {
  PENDING:    { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',    Icon: Clock         },
  DOWNLOADED: { label: 'Downloaded',        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',       Icon: CheckCircle2  },
  RESPONDED:  { label: 'Response Sent',     cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw },
  COMPLETED:  { label: 'Completed',         cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',    Icon: Archive       },
  EXPIRED:    { label: 'Expired',           cls: 'bg-red-500/20 text-red-400 border border-red-500/30',          Icon: AlertCircle   },
}

// ─────────────────── FolderTree ──────────────────────────────────────────────

interface FolderNode { name: string; children: Map<string, FolderNode>; files: TransferFileItem[] }

function buildFolderTree(files: TransferFileItem[]): FolderNode {
  const root: FolderNode = { name: '', children: new Map(), files: [] }
  for (const f of files) {
    if (!f.folderPath) {
      root.files.push(f)
      continue
    }
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

function FolderTreeNode({
  node,
  transferId,
  onDownloadFile,
  downloadingFile,
}: {
  node: FolderNode
  transferId: string
  onDownloadFile: (transferId: string, file: TransferFileItem) => void
  downloadingFile: string | null
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
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
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
              transferId={transferId}
              onDownload={onDownloadFile}
              downloading={downloadingFile === f.id}
            />
          ))}
          {Array.from(node.children.values()).map(child => (
            <FolderTreeNode
              key={child.name}
              node={child}
              transferId={transferId}
              onDownloadFile={onDownloadFile}
              downloadingFile={downloadingFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({
  file,
  transferId,
  onDownload,
  downloading,
}: {
  file: TransferFileItem
  transferId: string
  onDownload: (transferId: string, file: TransferFileItem) => void
  downloading: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 group">
      <div className="flex items-center gap-2 min-w-0">
        {fileIcon(file.mimeType)}
        <span className="text-xs text-slate-300 truncate">{file.originalName}</span>
        <span className="text-xs text-slate-600 shrink-0">{fmtSize(file.fileSize)}</span>
      </div>
      <button
        onClick={() => onDownload(transferId, file)}
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

// ─────────────────── TransferCard ────────────────────────────────────────────

function TransferCard({
  transfer,
  selected,
  onSelect,
}: {
  transfer: TransferItem
  selected: boolean
  onSelect: () => void
}) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const isPending = transfer.status === 'PENDING'
  const senderName = transfer.sender.username ?? transfer.sender.name ?? transfer.sender.email ?? 'Admin'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all p-4
        ${selected
          ? 'bg-indigo-600/20 border-indigo-500/50'
          : isPending
            ? 'bg-amber-500/5 border-amber-500/20 hover:bg-slate-800/60 hover:border-slate-700'
            : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-700'
        }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-600/40 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-indigo-300">{senderInitials(transfer.sender)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm font-semibold truncate ${isPending ? 'text-white' : 'text-slate-200'}`}>
              {transfer.subject}
            </span>
            <span className="text-xs text-slate-500 shrink-0">
              {formatDistanceToNow(new Date(transfer.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-2">
            <User2 className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-400 truncate">{senderName}</span>
          </div>

          {transfer.message && (
            <p className="text-xs text-slate-500 mb-2 line-clamp-2 leading-relaxed">
              {transfer.message}
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} · {fmtSize(transfer.totalSize)}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cls}`}>
              <Icon className="w-3 h-3" />
              {label}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─────────────────── TransferDetail ──────────────────────────────────────────

function TransferDetail({
  transfer,
  onDownloadZip,
  onDownloadFile,
  downloadingZip,
  downloadingFile,
}: {
  transfer: TransferItem
  onDownloadZip: (transferId: string) => void
  onDownloadFile: (transferId: string, file: TransferFileItem) => void
  downloadingZip: boolean
  downloadingFile: string | null
}) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const senderName = transfer.sender.username ?? transfer.sender.name ?? transfer.sender.email ?? 'Admin'
  const tree = buildFolderTree(transfer.files)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pb-5 border-b border-slate-700/50 mb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 className="text-lg font-bold text-white leading-tight">{transfer.subject}</h2>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">From</p>
            <p className="text-slate-200">{senderName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Received</p>
            <p className="text-slate-200">{format(new Date(transfer.createdAt), 'dd MMM yyyy, HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Files</p>
            <p className="text-slate-200">{transfer.totalFiles} · {fmtSize(transfer.totalSize)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Expires</p>
            <p className="text-slate-200">{format(new Date(transfer.expiresAt), 'dd MMM yyyy')}</p>
          </div>
        </div>

        {transfer.message && (
          <div className="mt-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700/40">
            <p className="text-xs text-slate-500 mb-1">Message</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{transfer.message}</p>
          </div>
        )}
      </div>

      {/* Download all */}
      <button
        onClick={() => onDownloadZip(transfer.id)}
        disabled={downloadingZip || transfer.status === 'EXPIRED'}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl
                   bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
                   text-white text-sm font-medium transition-colors mb-5"
      >
        {downloadingZip ? (
          <>
            <span className="w-4 h-4 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
            Preparing ZIP…
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download All ({transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''})
          </>
        )}
      </button>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Files</p>
        <FolderTreeNode
          node={tree}
          transferId={transfer.id}
          onDownloadFile={onDownloadFile}
          downloadingFile={downloadingFile}
        />
      </div>
    </div>
  )
}

// ─────────────────── Main Component ──────────────────────────────────────────

export function TransferInbox({ transfers }: Props) {
  const [selectedId, setSelectedId]       = useState<string | null>(transfers[0]?.id ?? null)
  const [downloadingZip,  setDownloadingZip]  = useState<string | null>(null)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  const selected = transfers.find(t => t.id === selectedId) ?? null

  const handleDownloadZip = useCallback(async (transferId: string) => {
    if (downloadingZip) return
    setDownloadingZip(transferId)
    try {
      const res = await fetch(`/api/transfers/${transferId}/download`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Download failed. Please try again.')
        return
      }
      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `transfer_${transferId}.zip`
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Download failed. Please try again.')
    } finally {
      setDownloadingZip(null)
    }
  }, [downloadingZip])

  const handleDownloadFile = useCallback(async (transferId: string, file: TransferFileItem) => {
    if (downloadingFile) return
    setDownloadingFile(file.id)
    try {
      const res = await fetch(`/api/transfers/${transferId}/files/${file.id}`)
      if (!res.ok) {
        alert('Could not get download link. Please try again.')
        return
      }
      const { url, filename } = await res.json()
      const a    = document.createElement('a')
      a.href     = url
      a.download = filename
      a.target   = '_blank'
      a.rel      = 'noopener noreferrer'
      a.click()
    } catch {
      alert('Download failed. Please try again.')
    } finally {
      setDownloadingFile(null)
    }
  }, [downloadingFile])

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 mb-4">
          <Inbox className="w-10 h-10 text-slate-500" />
        </div>
        <p className="text-slate-300 font-medium">No transfers yet</p>
        <p className="text-sm text-slate-500 mt-1">Files sent to you by the admin will appear here</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-11rem)]">
      {/* ── Transfer list ── */}
      <div className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
        {transfers.map(t => (
          <TransferCard
            key={t.id}
            transfer={t}
            selected={t.id === selectedId}
            onSelect={() => setSelectedId(t.id)}
          />
        ))}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="hidden md:flex flex-1 rounded-xl bg-slate-800/40 border border-slate-700/50 p-6 overflow-y-auto">
          <div className="w-full">
            <TransferDetail
              transfer={selected}
              onDownloadZip={handleDownloadZip}
              onDownloadFile={handleDownloadFile}
              downloadingZip={downloadingZip === selected.id}
              downloadingFile={downloadingFile}
            />
          </div>
        </div>
      )}
    </div>
  )
}
