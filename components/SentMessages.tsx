'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import {
  Paperclip, ArrowLeft, AlertCircle, Send, CheckCircle2, Clock, Users,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SentMessage {
  id:            string
  subject:       string
  priority:      'NORMAL' | 'URGENT'
  broadcastRole: string | null
  createdAt:     string
  readCount:     number
  totalCount:    number
  hasAttachment: boolean
}

interface Recipient {
  id:       string
  name:     string | null
  username: string | null
  email:    string
  role:     string
  read:     boolean
  readAt:   string | null
}

interface Receipts {
  messageId:     string
  subject:       string
  broadcastRole: string | null
  readCount:     number
  totalCount:    number
  recipients:    Recipient[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(r: Pick<Recipient, 'name' | 'username' | 'email'>): string {
  return r.name ?? r.username ?? r.email
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

const ROLE_LABEL: Record<string, string> = {
  ADMIN:    'Admin',
  UPLOADER: 'Uploader',
  EDITOR:   'Editor',
}

const BROADCAST_LABEL: Record<string, string> = {
  ALL:      'Everyone',
  UPLOADER: 'All Uploaders',
  EDITOR:   'All Editors',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecipientAvatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-600/70 flex items-center justify-center
                    font-semibold text-white text-xs shrink-0 select-none">
      {initials(name)}
    </div>
  )
}

function ReadProgressBar({ readCount, totalCount }: { readCount: number; totalCount: number }) {
  const pct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
        {readCount}/{totalCount} read
      </span>
    </div>
  )
}

// ─── Sent message row ─────────────────────────────────────────────────────────

function SentMessageRow({
  msg,
  selected,
  onClick,
}: {
  msg:      SentMessage
  selected: boolean
  onClick:  () => void
}) {
  const isUrgent    = msg.priority === 'URGENT'
  const allRead     = msg.readCount === msg.totalCount && msg.totalCount > 0
  const recipientSummary = msg.broadcastRole
    ? `Broadcast to ${BROADCAST_LABEL[msg.broadcastRole] ?? msg.broadcastRole} (${msg.totalCount})`
    : `Sent to ${msg.totalCount} ${msg.totalCount === 1 ? 'person' : 'people'}`

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 border-b border-slate-800/60 transition-colors
                  ${selected
                    ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
                    : 'hover:bg-slate-800/40'
                  }`}
    >
      {/* Top row: subject + badges + time */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{msg.subject}</p>
          {isUrgent && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-red-500/20 px-1.5 py-0.5
                             text-[9px] font-bold text-red-400 uppercase tracking-wide leading-none">
              Urgent
            </span>
          )}
          {msg.hasAttachment && (
            <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          {allRead && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="All recipients have read this" />
          )}
        </div>
        <span className="text-[11px] text-slate-500 shrink-0">{formatTimestamp(msg.createdAt)}</span>
      </div>

      {/* Recipients summary */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <Users className="w-3 h-3 text-slate-500 shrink-0" />
        <p className="text-xs text-slate-500">{recipientSummary}</p>
      </div>

      {/* Read progress bar */}
      <ReadProgressBar readCount={msg.readCount} totalCount={msg.totalCount} />
    </button>
  )
}

// ─── Receipts detail panel ────────────────────────────────────────────────────

function ReceiptsPanel({
  msg,
  receipts,
  loading,
  onBack,
}: {
  msg:      SentMessage
  receipts: Receipts | null
  loading:  boolean
  onBack:   () => void
}) {
  const router    = useRouter()
  const isUrgent  = msg.priority === 'URGENT'
  const replyHref = `/messages/new?subject=${encodeURIComponent('Re: ' + msg.subject)}`

  const broadcastLabel = msg.broadcastRole
    ? `Broadcast to ${BROADCAST_LABEL[msg.broadcastRole] ?? msg.broadcastRole}`
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Back (mobile) */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-slate-700/80 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sent
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Message header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white leading-snug mb-1">{msg.subject}</h2>
            <p className="text-xs text-slate-500">{formatTimestampFull(msg.createdAt)}</p>
          </div>
          {isUrgent && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full
                             bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400 uppercase tracking-wide">
              <AlertCircle className="w-3.5 h-3.5" />
              Urgent
            </span>
          )}
        </div>

        {/* Read receipt summary */}
        {receipts && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 mb-5">
            {broadcastLabel ? (
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                {broadcastLabel} — {receipts.readCount} of {receipts.totalCount} have read this
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Read receipts — {receipts.readCount} of {receipts.totalCount} read
              </p>
            )}
            <ReadProgressBar readCount={receipts.readCount} totalCount={receipts.totalCount} />
          </div>
        )}

        {/* Recipients list */}
        <div className="space-y-1 mb-6">
          {loading && (
            <p className="text-sm text-slate-500 py-4 text-center">Loading receipts…</p>
          )}

          {!loading && receipts?.recipients.map((r) => {
            const name = displayName(r)
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                           hover:bg-slate-800/40 transition-colors"
              >
                <RecipientAvatar name={name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{name}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABEL[r.role] ?? r.role}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {r.read ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-emerald-400">
                        {r.readAt
                          ? formatDistanceToNow(new Date(r.readAt), { addSuffix: true })
                          : 'Read'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="text-xs text-slate-500">Not yet read</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Follow-up button */}
        <div className="border-t border-slate-700/60 pt-5">
          <button
            onClick={() => router.push(replyHref)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600
                       hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white
                       transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Follow-up
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SentMessages({ className }: { className?: string }) {
  const [messages,    setMessages]    = useState<SentMessage[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [showDetail,  setShowDetail]  = useState(false)
  const [receipts,    setReceipts]    = useState<Receipts | null>(null)
  const [receiptsLoading, setReceiptsLoading] = useState(false)

  const fetchSent = useCallback(async () => {
    try {
      const res  = await fetch('/api/messages/sent')
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSent() }, [fetchSent])

  const openMessage = useCallback(async (msg: SentMessage) => {
    setSelectedId(msg.id)
    setShowDetail(true)
    setReceipts(null)
    setReceiptsLoading(true)
    try {
      const res  = await fetch(`/api/messages/${msg.id}/receipts`)
      if (!res.ok) return
      const data = await res.json()
      setReceipts(data)
    } catch { /* ignore */ } finally {
      setReceiptsLoading(false)
    }
  }, [])

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null

  return (
    <div className={className ?? 'flex h-[calc(100vh-8rem)] rounded-2xl overflow-hidden border border-slate-800/70 bg-slate-900'}>

      {/* ── Left: Sent list ─────────────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-slate-800/70 bg-slate-900
                       w-full lg:w-80 xl:w-96 shrink-0
                       ${showDetail ? 'hidden lg:flex' : 'flex'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-slate-800/70 shrink-0">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" />
            <h1 className="text-sm font-semibold text-white">Sent Messages</h1>
            {!loading && (
              <span className="text-xs text-slate-500">({messages.length})</span>
            )}
          </div>
          <Link
            href="/messages/new"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5
                       text-xs font-semibold text-white transition-colors"
          >
            + New
          </Link>
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
                <Send className="w-7 h-7 text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-400 mb-1">No sent messages</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Messages you send will appear here with read receipts.
              </p>
            </div>
          )}

          {!loading && messages.map((msg) => (
            <SentMessageRow
              key={msg.id}
              msg={msg}
              selected={selectedId === msg.id}
              onClick={() => openMessage(msg)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Receipts panel ────────────────────────────────────────── */}
      <div className={`flex-1 bg-slate-900 min-w-0
                       ${showDetail ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}
      >
        {selectedMessage ? (
          <ReceiptsPanel
            msg={selectedMessage}
            receipts={receipts}
            loading={receiptsLoading}
            onBack={() => setShowDetail(false)}
          />
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">Select a message</p>
            <p className="text-xs text-slate-600">
              Click a sent message to see read receipts.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
