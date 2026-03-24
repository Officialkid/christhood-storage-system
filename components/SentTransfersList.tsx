'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Send,
  Clock, CheckCircle2, RefreshCcw, Archive, AlertCircle,
  User2, Bell, Download, Lock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TransferStatus = 'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'

interface RecipientInfo {
  id:       string
  username: string | null
  name:     string | null
  email:    string
  role:     string
}

interface ResponseSummary {
  id:                string
  downloadedByAdmin: boolean
  totalFiles:        number
  totalSize:         number
  createdAt:         string
}

export interface SentTransferItem {
  id:             string
  subject:        string
  message:        string | null
  status:         TransferStatus
  totalFiles:     number
  totalSize:      number
  expiresAt:      string
  createdAt:      string
  isPinProtected: boolean
  recipient:      RecipientInfo
  response:       ResponseSummary | null
}

interface Props {
  transfers: SentTransferItem[]
}

type FilterTab = 'ALL' | TransferStatus

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const STATUS_META: Record<
  TransferStatus,
  { label: string; cls: string; Icon: React.FC<{ className?: string }> }
> = {
  PENDING:    { label: 'Awaiting Download', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',       Icon: Clock         },
  DOWNLOADED: { label: 'Downloaded',        cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',         Icon: CheckCircle2  },
  RESPONDED:  { label: 'Response Sent',     cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', Icon: RefreshCcw    },
  COMPLETED:  { label: 'Completed',         cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',       Icon: Archive       },
  EXPIRED:    { label: 'Expired',           cls: 'bg-red-500/20 text-red-400 border border-red-500/30',             Icon: AlertCircle   },
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL',       label: 'All'        },
  { key: 'PENDING',   label: 'Pending'    },
  { key: 'DOWNLOADED',label: 'Downloaded' },
  { key: 'RESPONDED', label: 'Responded'  },
  { key: 'COMPLETED', label: 'Completed'  },
  { key: 'EXPIRED',   label: 'Expired'    },
]

// ─────────────────────────────────────────────────────────────────────────────
// SentTransferCard
// ─────────────────────────────────────────────────────────────────────────────

function SentTransferCard({ transfer }: { transfer: SentTransferItem }) {
  const { label, cls, Icon } = STATUS_META[transfer.status]
  const hasNewResponse = transfer.status === 'RESPONDED' && transfer.response && !transfer.response.downloadedByAdmin
  const recipientLabel  = transfer.recipient.username ?? transfer.recipient.name ?? transfer.recipient.email
  const roleLabel       = transfer.recipient.role.charAt(0) + transfer.recipient.role.slice(1).toLowerCase()

  return (
    <Link
      href={`/transfers/sent/${transfer.id}`}
      className={`relative block rounded-xl border transition-all p-4 ${
        hasNewResponse
          ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50'
          : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-700'
      }`}
    >
      {/* New response notification dot */}
      {hasNewResponse && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar — recipient's initials */}
        <div className="w-9 h-9 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-slate-300">
            {recipientLabel.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0 flex-1 pr-4">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold text-slate-200 truncate">
              {transfer.isPinProtected && (
                <Lock className="inline w-3 h-3 text-amber-400 mr-1 -mt-0.5" />
              )}
              {transfer.subject}
            </span>
            <span className="text-xs text-slate-500 shrink-0">
              {formatDistanceToNow(new Date(transfer.createdAt), { addSuffix: true })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-2">
            <User2 className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-400 truncate">
              {recipientLabel}
              <span className="text-slate-600 ml-1">· {roleLabel}</span>
            </span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-slate-500">
              {transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''} · {fmtSize(transfer.totalSize)}
            </span>

            <div className="flex items-center gap-2">
              {hasNewResponse && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  <Bell className="w-3 h-3" />
                  New Response
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cls}`}>
                <Icon className="w-3 h-3" />
                {label}
              </span>
            </div>
          </div>

          {/* Response summary if admin already reviewed */}
          {transfer.status === 'RESPONDED' && transfer.response && transfer.response.downloadedByAdmin && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Download className="w-3 h-3" />
              <span>
                Response downloaded ·&nbsp;
                {transfer.response.totalFiles} file{transfer.response.totalFiles !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SentTransfersList({ transfers }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')

  const filtered = activeTab === 'ALL'
    ? transfers
    : transfers.filter(t => t.status === activeTab)

  // Count badges per tab
  const counts = TABS.reduce<Record<FilterTab, number>>((acc, tab) => {
    acc[tab.key] = tab.key === 'ALL'
      ? transfers.length
      : transfers.filter(t => t.status === tab.key).length
    return acc
  }, {} as Record<FilterTab, number>)

  const respondedCount = transfers.filter(
    t => t.status === 'RESPONDED' && t.response && !t.response.downloadedByAdmin
  ).length

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 mb-4">
          <Send className="w-10 h-10 text-slate-500" />
        </div>
        <p className="text-slate-300 font-medium">No transfers sent yet</p>
        <p className="text-sm text-slate-500 mt-1">
          Use&nbsp;
          <Link href="/transfers/new" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            New Transfer
          </Link>
          &nbsp;to send files to a recipient.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap items-center gap-1 mb-5">
        {TABS.map(tab => {
          const count    = counts[tab.key]
          const isActive = activeTab === tab.key
          const showDot  = tab.key === 'RESPONDED' && respondedCount > 0

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-600/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-xs px-1 ${
                  isActive
                    ? 'bg-indigo-600/50 text-indigo-200'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {count}
                </span>
              )}
              {showDot && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Transfer list ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-slate-400 font-medium">No {activeTab.toLowerCase()} transfers</p>
          <p className="text-sm text-slate-600 mt-1">Try a different filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {filtered.map(t => (
            <SentTransferCard key={t.id} transfer={t} />
          ))}
        </div>
      )}
    </div>
  )
}
