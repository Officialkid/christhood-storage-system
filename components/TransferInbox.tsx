'use client'

import Link from 'next/link'
import {
  Inbox,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

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
}

interface Props {
  transfers: TransferItem[]
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const STATUS_META: Record<TransferStatus, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  PENDING:    { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',       Icon: Clock        },
  DOWNLOADED: { label: 'Downloaded',        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',         Icon: CheckCircle2 },
  RESPONDED:  { label: 'Response Sent',     cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw   },
  COMPLETED:  { label: 'Completed',         cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',       Icon: Archive      },
  EXPIRED:    { label: 'Expired',           cls: 'bg-red-500/20 text-red-400 border border-red-500/30',             Icon: AlertCircle  },
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TransferCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TransferCard({ transfer }: { transfer: TransferItem }) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const isPending  = transfer.status === 'PENDING'
  const senderName = transfer.sender.username ?? transfer.sender.name ?? transfer.sender.email ?? 'Admin'

  return (
    <Link
      href={`/transfers/inbox/${transfer.id}`}
      className={`block rounded-xl border transition-all p-4 ${
        isPending
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
              {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} Â· {fmtSize(transfer.totalSize)}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cls}`}>
              <Icon className="w-3 h-3" />
              {label}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TransferInbox({ transfers }: Props) {
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
    <div className="flex flex-col gap-2 max-w-2xl">
      {transfers.map(t => (
        <TransferCard key={t.id} transfer={t} />
      ))}
    </div>
  )
}
