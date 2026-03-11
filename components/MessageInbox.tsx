'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { Paperclip, ArrowLeft, ExternalLink, Inbox, AlertCircle } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedTransfer {
  id:         string
  subject:    string
  totalFiles: number
  totalSize:  string
  status:     string
}

interface InboxMessage {
  id:          string
  subject:     string
  body:        string
  priority:    'NORMAL' | 'URGENT'
  read:        boolean
  readAt:      string | null
  createdAt:   string
  sender: {
    id:       string
    name:     string | null
    username: string | null
  }
  attachmentTransfer: AttachedTransfer | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(s: InboxMessage['sender']): string {
  return s.name ?? s.username ?? 'Admin'
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (isToday(d))     return formatDistanceToNow(d, { addSuffix: true })
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function formatTimestampFull(iso: string): string {
  return format(new Date(iso), "MMMM d, yyyy 'at' h:mm a")
}

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pending',
  DOWNLOADED: 'Downloaded',
  RESPONDED:  'Responded',
  COMPLETED:  'Completed',
  EXPIRED:    'Expired',
}

const TRANSFER_STATUS_COLOR: Record<string, string> = {
  PENDING:    'text-yellow-400 bg-yellow-400/10',
  DOWNLOADED: 'text-blue-400 bg-blue-400/10',
  RESPONDED:  'text-indigo-400 bg-indigo-400/10',
  COMPLETED:  'text-green-400 bg-green-400/10',
  EXPIRED:    'text-slate-400 bg-slate-400/10',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SenderAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const sz  = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} rounded-full bg-indigo-600/70 flex items-center justify-center
                     font-semibold text-white shrink-0 select-none`}>
      {initials(name)}
    </div>
  )
}

function TransferCard({ transfer }: { transfer: AttachedTransfer }) {
  const statusLabel = TRANSFER_STATUS_LABEL[transfer.status] ?? transfer.status
  const statusColor = TRANSFER_STATUS_COLOR[transfer.status] ?? 'text-slate-400 bg-slate-400/10'

  return (
    <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Attached Transfer
        </span>
      </div>

      <p className="text-sm font-semibold text-white mb-2 truncate">{transfer.subject}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-slate-400">
        <span>{transfer.totalFiles} file{transfer.totalFiles !== 1 ? 's' : ''}</span>
        <span>{transfer.totalSize}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <Link
        href={`/transfers/inbox`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400
                   hover:text-indigo-300 transition-colors"
      >
        Go to Transfer Inbox
        <ExternalLink className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

// ─── Inbox row ────────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  selected,
  onClick,
}: {
  msg:      InboxMessage
  selected: boolean
  onClick:  () => void
}) {
  const name    = displayName(msg.sender)
  const preview = msg.body.length > 100 ? msg.body.slice(0, 100) + '…' : msg.body
  const isUrgent = msg.priority === 'URGENT'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-800/60
                  transition-colors flex gap-3 items-start
                  ${selected
                    ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
                    : msg.read
                      ? 'hover:bg-slate-800/40'
                      : isUrgent
                        ? 'bg-red-950/20 hover:bg-red-950/30'
                        : 'bg-indigo-950/25 hover:bg-indigo-950/40'
                  }`}
    >
      {/* Unread dot */}
      <div className="mt-2 shrink-0">
        <div className={`w-2 h-2 rounded-full ${
          msg.read ? 'bg-transparent' : isUrgent ? 'bg-red-400' : 'bg-indigo-400'
        }`} />
      </div>

      {/* Avatar */}
      <SenderAvatar name={name} size="sm" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${msg.read ? 'text-slate-300' : 'text-white font-semibold'}`}>
            {name}
          </span>
          <span className="text-[11px] text-slate-500 shrink-0">
            {formatTimestamp(msg.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mb-0.5">
          <p className={`text-sm truncate ${msg.read ? 'text-slate-400' : 'text-slate-100 font-medium'}`}>
            {msg.subject}
          </p>
          {isUrgent && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-red-500/20 px-1.5 py-0.5
                             text-[9px] font-bold text-red-400 uppercase tracking-wide leading-none">
              Urgent
            </span>
          )}
          {msg.attachmentTransfer && (
            <Paperclip className="w-3 h-3 text-slate-500 shrink-0" />
          )}
        </div>

        <p className="text-xs text-slate-500 truncate leading-relaxed">{preview}</p>
      </div>
    </button>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function MessageDetail({
  msg,
  onBack,
}: {
  msg:    InboxMessage
  onBack: () => void
}) {
  const name     = displayName(msg.sender)
  const isUrgent = msg.priority === 'URGENT'

  return (
    <div className="flex flex-col h-full">
      {/* Back button (mobile only) */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-slate-700/80 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to inbox
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <SenderAvatar name={name} />
            <div>
              <p className="text-sm font-semibold text-white">{name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatTimestampFull(msg.createdAt)}
              </p>
            </div>
          </div>
          {isUrgent && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full
                             bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400 uppercase tracking-wide">
              <AlertCircle className="w-3.5 h-3.5" />
              Urgent
            </span>
          )}
        </div>

        {/* Subject */}
        <h2 className="text-xl font-bold text-white leading-snug mb-5">
          {msg.subject}
        </h2>

        <hr className="border-slate-700/60 mb-5" />

        {/* Body */}
        <div className="text-sm text-slate-200 leading-7 whitespace-pre-wrap break-words">
          {msg.body}
        </div>

        {/* Transfer attachment */}
        {msg.attachmentTransfer && (
          <TransferCard transfer={msg.attachmentTransfer} />
        )}
      </div>
    </div>
  )
}

// ─── Main inbox component ─────────────────────────────────────────────────────

export function MessageInbox() {
  const [messages,     setMessages]     = useState<InboxMessage[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [showDetail,   setShowDetail]   = useState(false)   // mobile toggle

  const fetchInbox = useCallback(async () => {
    try {
      const res  = await fetch('/api/messages/inbox')
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInbox()
    const id = setInterval(fetchInbox, 60_000)
    return () => clearInterval(id)
  }, [fetchInbox])

  // Mark as read when opening a message
  const openMessage = useCallback((msg: InboxMessage) => {
    setSelectedId(msg.id)
    setShowDetail(true)

    if (!msg.read) {
      // Optimistically mark read in local state
      setMessages((prev) =>
        prev.map((m) => m.id === msg.id ? { ...m, read: true } : m),
      )

      // Persist + update bell badge
      fetch(`/api/messages/${msg.id}/read`, { method: 'PATCH' })
        .then((r) => r.json())
        .then((d) => {
          // Notify the bell to refresh its count immediately
          window.dispatchEvent(new CustomEvent('messagemarkedread', { detail: d }))
        })
        .catch(() => {})
    }
  }, [])

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null
  const unreadCount     = messages.filter((m) => !m.read).length

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-2xl overflow-hidden border border-slate-800/70 bg-slate-900">

      {/* ── Left: Inbox list ────────────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-slate-800/70 bg-slate-900
                       w-full lg:w-80 xl:w-96 shrink-0
                       ${showDetail ? 'hidden lg:flex' : 'flex'}`}
      >
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-slate-800/70 shrink-0">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-400" />
            <h1 className="text-sm font-semibold text-white">Messages</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px]
                               font-bold text-white leading-none">
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
              Loading…
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <Inbox className="w-7 h-7 text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-400 mb-1">No messages yet</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Messages from your admin will appear here.
              </p>
            </div>
          )}

          {!loading && messages.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              selected={selectedId === msg.id}
              onClick={() => openMessage(msg)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Detail panel ─────────────────────────────────────────── */}
      <div className={`flex-1 bg-slate-900 min-w-0
                       ${showDetail ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}
      >
        {selectedMessage ? (
          <MessageDetail
            msg={selectedMessage}
            onBack={() => setShowDetail(false)}
          />
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">Select a message</p>
            <p className="text-xs text-slate-600">
              Choose a message from the inbox to read it here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
