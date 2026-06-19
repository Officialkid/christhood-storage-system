'use client'

import Link from 'next/link'
import {
  Inbox,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, Lock, ArrowRight, ShieldCheck,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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
  isPinProtected?: boolean
  sender: { id: string; username: string | null; name: string | null; email: string | null }
}

interface Props {
  transfers: TransferItem[]
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function senderInitials(sender: TransferItem['sender']): string {
  const name = sender.username ?? sender.name ?? sender.email ?? '?'
  return name.slice(0, 2).toUpperCase()
}

const STATUS_META: Record<TransferStatus, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  PENDING: { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', Icon: Clock },
  DOWNLOADED: { label: 'Downloaded', cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', Icon: CheckCircle2 },
  RESPONDED: { label: 'Response Sent', cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw },
  COMPLETED: { label: 'Completed', cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40', Icon: Archive },
  EXPIRED: { label: 'Expired', cls: 'bg-red-500/20 text-red-400 border border-red-500/30', Icon: AlertCircle },
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'amber' | 'emerald' | 'indigo'
}) {
  const tones = {
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300',
  }

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
      <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function TransferCard({ transfer }: { transfer: TransferItem }) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const isPending = transfer.status === 'PENDING'
  const senderName = transfer.sender.username ?? transfer.sender.name ?? transfer.sender.email ?? 'Admin'

  return (
    <Link
      href={`/transfers/inbox/${transfer.id}`}
      className={`block rounded-2xl border p-4 transition-all ${
        isPending
          ? 'bg-amber-500/5 border-amber-500/20 hover:bg-slate-800/70 hover:border-amber-500/40'
          : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/70 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-600/40 bg-indigo-600/30 shrink-0">
          <span className="text-xs font-bold text-indigo-300">{senderInitials(transfer.sender)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={`truncate text-sm font-semibold ${isPending ? 'text-white' : 'text-slate-200'}`}>
              {transfer.isPinProtected && <Lock className="mr-1 inline h-3 w-3 -mt-0.5 text-amber-400" />}
              {transfer.subject}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {formatDistanceToNow(new Date(transfer.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="mb-2 flex items-center gap-1.5">
            <User2 className="h-3 w-3 shrink-0 text-slate-500" />
            <span className="truncate text-xs text-slate-400">{senderName}</span>
          </div>

          {transfer.message && (
            <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
              {transfer.message}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1">
                {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1">
                {fmtSize(transfer.totalSize)}
              </span>
              {transfer.isPinProtected && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-300">
                  <ShieldCheck className="h-3 w-3" />
                  Protected
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${cls}`}>
                <Icon className="h-3 w-3" />
                {label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300">
                Open
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TransferInbox({ transfers }: Props) {
  const orderedTransfers = [...transfers].sort((a, b) => {
    const priority = (status: TransferStatus) =>
      status === 'PENDING' ? 0 :
      status === 'RESPONDED' ? 1 :
      status === 'DOWNLOADED' ? 2 :
      status === 'COMPLETED' ? 3 : 4

    return priority(a.status) - priority(b.status)
  })

  const awaitingAction = transfers.filter(t => t.status === 'PENDING' || t.status === 'RESPONDED').length
  const completed = transfers.filter(t => t.status === 'DOWNLOADED' || t.status === 'COMPLETED').length

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
          <Inbox className="h-10 w-10 text-slate-500" />
        </div>
        <p className="font-medium text-slate-300">No transfers yet</p>
        <p className="mt-1 text-sm text-slate-500">Files sent to you by the admin will appear here.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Need your attention" value={awaitingAction} tone="amber" />
        <SummaryCard label="Completed or downloaded" value={completed} tone="emerald" />
        <SummaryCard label="All received transfers" value={transfers.length} tone="indigo" />
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
        <p className="text-sm font-medium text-white">Files shared with you</p>
        <p className="mt-1 text-sm text-slate-400">
          Open any transfer to download files, respond, or continue work. The newest urgent items stay near the top.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {orderedTransfers.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} />
        ))}
      </div>
    </div>
  )
}
