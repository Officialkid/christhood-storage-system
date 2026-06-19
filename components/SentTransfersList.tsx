'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Send,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, Bell, Download, Lock, ArrowRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

interface RecipientInfo {
  id: string
  username: string | null
  name: string | null
  email: string
  role: string
}

interface ResponseSummary {
  id: string
  downloadedByAdmin: boolean
  totalFiles: number
  totalSize: number
  createdAt: string
}

export interface SentTransferItem {
  id: string
  subject: string
  message: string | null
  status: TransferStatus
  totalFiles: number
  totalSize: number
  expiresAt: string
  createdAt: string
  isPinProtected: boolean
  recipient: RecipientInfo
  response: ResponseSummary | null
}

interface Props {
  transfers: SentTransferItem[]
}

type FilterTab = 'ALL' | TransferStatus

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const STATUS_META: Record<
  TransferStatus,
  { label: string; cls: string; Icon: React.FC<{ className?: string }> }
> = {
  PENDING: { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', Icon: Clock },
  DOWNLOADED: { label: 'Downloaded', cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', Icon: CheckCircle2 },
  RESPONDED: { label: 'Response Sent', cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw },
  COMPLETED: { label: 'Completed', cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40', Icon: Archive },
  EXPIRED: { label: 'Expired', cls: 'bg-red-500/20 text-red-400 border border-red-500/30', Icon: AlertCircle },
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'DOWNLOADED', label: 'Downloaded' },
  { key: 'RESPONDED', label: 'Responded' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'EXPIRED', label: 'Expired' },
]

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
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

function SentTransferCard({ transfer }: { transfer: SentTransferItem }) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const hasNewResponse = transfer.status === 'RESPONDED' && transfer.response && !transfer.response.downloadedByAdmin
  const recipientLabel = transfer.recipient.username ?? transfer.recipient.name ?? transfer.recipient.email
  const roleLabel = transfer.recipient.role.charAt(0) + transfer.recipient.role.slice(1).toLowerCase()

  return (
    <Link
      href={`/transfers/sent/${transfer.id}`}
      className={`relative block rounded-2xl border p-4 transition-all ${
        hasNewResponse
          ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50'
          : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/70 hover:border-slate-600'
      }`}
    >
      {hasNewResponse && (
        <span className="absolute right-3 top-3 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-600/40 bg-slate-700/60 shrink-0">
          <span className="text-xs font-bold text-slate-300">
            {recipientLabel.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0 flex-1 pr-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-200">
              {transfer.isPinProtected && <Lock className="mr-1 inline h-3 w-3 -mt-0.5 text-amber-400" />}
              {transfer.subject}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {formatDistanceToNow(new Date(transfer.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="mb-2 flex items-center gap-1.5">
            <User2 className="h-3 w-3 shrink-0 text-slate-500" />
            <span className="truncate text-xs text-slate-400">
              {recipientLabel}
              <span className="ml-1 text-slate-600">· {roleLabel}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1">
                {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1">
                {fmtSize(transfer.totalSize)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {hasNewResponse && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  <Bell className="h-3 w-3" />
                  New Response
                </span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}>
                <Icon className="h-3 w-3" />
                {label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300">
                Open
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>

          {transfer.status === 'RESPONDED' && transfer.response && transfer.response.downloadedByAdmin && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Download className="h-3 w-3" />
              <span>
                Response downloaded · {transfer.response.totalFiles} file{transfer.response.totalFiles !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export function SentTransfersList({ transfers }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')

  const filtered = activeTab === 'ALL'
    ? transfers
    : transfers.filter((transfer) => transfer.status === activeTab)

  const counts = TABS.reduce<Record<FilterTab, number>>((acc, tab) => {
    acc[tab.key] = tab.key === 'ALL'
      ? transfers.length
      : transfers.filter((transfer) => transfer.status === tab.key).length
    return acc
  }, {} as Record<FilterTab, number>)

  const respondedCount = transfers.filter(
    (transfer) => transfer.status === 'RESPONDED' && transfer.response && !transfer.response.downloadedByAdmin,
  ).length
  const awaitingDownload = transfers.filter((transfer) => transfer.status === 'PENDING').length
  const totalSize = useMemo(
    () => transfers.reduce((sum, transfer) => sum + transfer.totalSize, 0),
    [transfers],
  )

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4">
          <Send className="h-10 w-10 text-slate-500" />
        </div>
        <p className="font-medium text-slate-300">No transfers sent yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Use{' '}
          <Link href="/transfers/new" className="text-indigo-400 transition-colors hover:text-indigo-300">
            New Transfer
          </Link>{' '}
          to send files to a recipient.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Waiting for recipient" value={awaitingDownload} tone="amber" />
        <SummaryCard label="New responses" value={respondedCount} tone="emerald" />
        <SummaryCard label="Total sent size" value={fmtSize(totalSize)} tone="indigo" />
      </div>

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
        <p className="text-sm font-medium text-white">Transfers you have sent</p>
        <p className="mt-1 text-sm text-slate-400">
          Track who has downloaded files, who has responded, and which work still needs follow-up.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((tab) => {
          const count = counts[tab.key]
          const isActive = activeTab === tab.key
          const showDot = tab.key === 'RESPONDED' && respondedCount > 0

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? 'border-indigo-600/40 bg-indigo-600/30 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs ${
                  isActive ? 'bg-indigo-600/50 text-indigo-200' : 'bg-slate-700 text-slate-400'
                }`}>
                  {count}
                </span>
              )}
              {showDot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="font-medium text-slate-400">No {activeTab.toLowerCase()} transfers</p>
          <p className="mt-1 text-sm text-slate-600">Try a different filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((transfer) => (
            <SentTransferCard key={transfer.id} transfer={transfer} />
          ))}
        </div>
      )}
    </div>
  )
}
