'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter }            from 'next/navigation'
import Link                     from 'next/link'
import {
  FolderInput, MessageSquare, MessageSquarePlus, MessagesSquare,
} from 'lucide-react'
import { TransferInbox }         from './TransferInbox'
import { SentTransfersList }     from './SentTransfersList'
import type { SentTransferItem } from './SentTransfersList'
import { MessageInbox }          from './MessageInbox'
import { SentMessages }          from './SentMessages'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab         = 'transfers' | 'messages'
type TransferSubTab  = 'inbox' | 'sent'
type MessageSubTab   = 'inbox' | 'sent'

// Structurally compatible with TransferInbox's internal TransferItem type
interface ReceivedTransferItem {
  id:         string
  subject:    string
  message:    string | null
  status:     'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'
  totalFiles: number
  totalSize:  number
  expiresAt:  string
  createdAt:  string
  sender: { id: string; username: string | null; name: string | null; email: string | null }
}

interface Props {
  initialTab: MainTab
  isAdmin:    boolean
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommunicationsHub({ initialTab, isAdmin }: Props) {
  const router = useRouter()

  const [activeTab,       setActiveTab]       = useState<MainTab>(initialTab)
  const [transferSubTab,  setTransferSubTab]  = useState<TransferSubTab>('inbox')
  const [msgSubTab,       setMsgSubTab]       = useState<MessageSubTab>(isAdmin ? 'sent' : 'inbox')

  // Badge counts (polled every 60 s)
  const [transfersBadge,  setTransfersBadge]  = useState(0)
  const [messagesBadge,   setMessagesBadge]   = useState(0)
  const [hasUrgent,       setHasUrgent]       = useState(false)
  const [totalTransfers,  setTotalTransfers]  = useState<number | null>(null)

  // Transfer inbox data (received)
  const [receivedTransfers, setReceivedTransfers] = useState<ReceivedTransferItem[]>([])
  const [receivedLoading,   setReceivedLoading]   = useState(false)
  const [receivedFetched,   setReceivedFetched]   = useState(false)

  // Admin sent transfers data
  const [sentTransfers, setSentTransfers] = useState<SentTransferItem[]>([])
  const [sentLoading,   setSentLoading]   = useState(false)
  const [sentFetched,   setSentFetched]   = useState(false)

  // ─── Counts polling ─────────────────────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/communications/counts')
      if (!res.ok) return
      const data = await res.json()
      setTransfersBadge(data.transfersCount  ?? 0)
      setMessagesBadge (data.messagesCount   ?? 0)
      setHasUrgent     (data.hasUrgent       ?? false)
      setTotalTransfers(data.totalTransfers  ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchCounts()
    const id = setInterval(fetchCounts, 60_000)
    return () => clearInterval(id)
  }, [fetchCounts])

  useEffect(() => {
    const handler = () => fetchCounts()
    window.addEventListener('messagemarkedread', handler)
    return () => window.removeEventListener('messagemarkedread', handler)
  }, [fetchCounts])

  // ─── Transfer data loading (lazy) ───────────────────────────────────────────

  const loadReceived = useCallback(async () => {
    if (receivedFetched) return
    setReceivedLoading(true)
    try {
      const res  = await fetch('/api/transfers/inbox')
      if (!res.ok) return
      const data = await res.json()
      setReceivedTransfers(data.transfers ?? [])
    } catch { /* ignore */ } finally {
      setReceivedLoading(false)
      setReceivedFetched(true)
    }
  }, [receivedFetched])

  const loadSent = useCallback(async () => {
    if (sentFetched) return
    setSentLoading(true)
    try {
      const res  = await fetch('/api/transfers/sent')
      if (!res.ok) return
      const data = await res.json()
      setSentTransfers(data.transfers ?? [])
    } catch { /* ignore */ } finally {
      setSentLoading(false)
      setSentFetched(true)
    }
  }, [sentFetched])

  // Load transfer data when transfers tab is active
  useEffect(() => {
    if (activeTab !== 'transfers') return
    if (!isAdmin || transferSubTab === 'inbox') {
      loadReceived()
    } else {
      loadSent()
    }
  }, [activeTab, isAdmin, transferSubTab, loadReceived, loadSent])

  // ─── Tab switching ───────────────────────────────────────────────────────────

  const switchTab = (tab: MainTab) => {
    setActiveTab(tab)
    router.replace(`/communications/${tab}`, { scroll: false })
  }

  // ─── Unified empty state for non-admin ──────────────────────────────────────

  const isUnifiedEmpty =
    !isAdmin &&
    totalTransfers === 0 &&
    messagesBadge  === 0 &&
    receivedFetched &&
    receivedTransfers.length === 0

  // CSS class passed to MessageInbox / SentMessages so they fill the hub container
  const FILL_CLASS = 'flex h-full overflow-hidden'

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl overflow-hidden
                    border border-slate-800/70 bg-slate-900">

      {/* ── Main tab bar ────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-2
                      px-3 py-2 border-b border-slate-800/70 bg-slate-950/60">

        <div className="flex items-center gap-0.5">
          <TabBtn
            active={activeTab === 'transfers'}
            onClick={() => switchTab('transfers')}
            label="Transfers"
            icon={<FolderInput className="w-4 h-4" />}
            badge={transfersBadge}
            badgeCls="bg-amber-500/20 text-amber-300 border border-amber-500/30"
          />
          <TabBtn
            active={activeTab === 'messages'}
            onClick={() => switchTab('messages')}
            label="Messages"
            icon={<MessageSquare className="w-4 h-4" />}
            badge={messagesBadge}
            badgeCls={
              hasUrgent
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            }
          />
        </div>

        {/* Action button visible to admin only */}
        {isAdmin && (
          <Link
            href={activeTab === 'transfers' ? '/transfers/new' : '/messages/new'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                       bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold
                       transition-colors shrink-0"
          >
            {activeTab === 'transfers' ? (
              <>
                <FolderInput className="w-3.5 h-3.5" />
                <span>New Transfer</span>
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>New Message</span>
              </>
            )}
          </Link>
        )}
      </div>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">

        {isUnifiedEmpty ? (
          <UnifiedEmptyState />

        ) : activeTab === 'transfers' ? (
          <TransferTabContent
            isAdmin={isAdmin}
            subTab={transferSubTab}
            setSubTab={(s) => {
              setTransferSubTab(s)
              if (s === 'inbox') loadReceived()
              else               loadSent()
            }}
            receivedTransfers={receivedTransfers}
            receivedLoading={receivedLoading}
            sentTransfers={sentTransfers}
            sentLoading={sentLoading}
            transfersBadge={transfersBadge}
          />

        ) : (
          <MessageTabContent
            isAdmin={isAdmin}
            subTab={msgSubTab}
            setSubTab={setMsgSubTab}
            messagesBadge={messagesBadge}
            hasUrgent={hasUrgent}
            fillClass={FILL_CLASS}
          />
        )}
      </div>
    </div>
  )
}

// ─── Transfers tab ────────────────────────────────────────────────────────────

function TransferTabContent({
  isAdmin, subTab, setSubTab,
  receivedTransfers, receivedLoading,
  sentTransfers, sentLoading,
  transfersBadge,
}: {
  isAdmin:    boolean
  subTab:     TransferSubTab
  setSubTab:  (s: TransferSubTab) => void
  receivedTransfers: ReceivedTransferItem[]
  receivedLoading:   boolean
  sentTransfers:     SentTransferItem[]
  sentLoading:       boolean
  transfersBadge:    number
}) {
  return (
    <>
      {isAdmin && (
        <div className="shrink-0 flex items-center gap-0.5
                        px-3 py-2 border-b border-slate-800/50 bg-slate-900">
          <SubTabBtn
            active={subTab === 'inbox'}
            onClick={() => setSubTab('inbox')}
            label="Inbox"
          />
          <SubTabBtn
            active={subTab === 'sent'}
            onClick={() => setSubTab('sent')}
            label="Sent"
            badge={transfersBadge > 0 && subTab !== 'sent' ? transfersBadge : undefined}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {(!isAdmin || subTab === 'inbox') ? (
          receivedLoading
            ? <LoadingSpinner />
            : <TransferInbox transfers={receivedTransfers} />
        ) : (
          sentLoading
            ? <LoadingSpinner />
            : <SentTransfersList transfers={sentTransfers} />
        )}
      </div>
    </>
  )
}

// ─── Messages tab ─────────────────────────────────────────────────────────────

function MessageTabContent({
  isAdmin, subTab, setSubTab,
  messagesBadge, hasUrgent, fillClass,
}: {
  isAdmin:       boolean
  subTab:        MessageSubTab
  setSubTab:     (s: MessageSubTab) => void
  messagesBadge: number
  hasUrgent:     boolean
  fillClass:     string
}) {
  return (
    <>
      {isAdmin && (
        <div className="shrink-0 flex items-center gap-0.5
                        px-3 py-2 border-b border-slate-800/50 bg-slate-900">
          <SubTabBtn
            active={subTab === 'inbox'}
            onClick={() => setSubTab('inbox')}
            label="Inbox"
            badge={
              messagesBadge > 0 && subTab !== 'inbox'
                ? messagesBadge
                : undefined
            }
          />
          <SubTabBtn
            active={subTab === 'sent'}
            onClick={() => setSubTab('sent')}
            label="Sent"
          />
        </div>
      )}

      {/* Split-pane message component fills all remaining height */}
      <div className="flex-1 overflow-hidden min-h-0">
        {(!isAdmin || subTab === 'inbox') ? (
          <MessageInbox className={fillClass} />
        ) : (
          <SentMessages className={fillClass} />
        )}
      </div>
    </>
  )
}

// ─── Shared mini-components ───────────────────────────────────────────────────

function TabBtn({
  active, onClick, label, icon, badge, badgeCls,
}: {
  active:   boolean
  onClick:  () => void
  label:    string
  icon:     React.ReactNode
  badge:    number
  badgeCls: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${active
          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/30'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none border ${badgeCls}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function SubTabBtn({
  active, onClick, label, badge,
}: {
  active:  boolean
  onClick: () => void
  label:   string
  badge?:  number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
        ${active
          ? 'bg-slate-700 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-indigo-500/20 text-indigo-300
                         px-1.5 py-0.5 text-[9px] font-bold leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
      Loading…
    </div>
  )
}

function UnifiedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700/60
                      flex items-center justify-center mb-5">
        <MessagesSquare className="w-10 h-10 text-slate-600" />
      </div>
      <p className="text-base font-semibold text-slate-300 mb-2">Nothing here yet</p>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
        This is where your file transfers and messages from your admin will appear.
      </p>
    </div>
  )
}
