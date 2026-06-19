'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link                     from 'next/link'
import {
  FolderInput, MessageSquare, MessageSquarePlus, MessagesSquare, ArrowRight, ArrowLeftRight, Inbox,
} from 'lucide-react'
import { TransferInbox }         from './TransferInbox'
import { SentTransfersList }     from './SentTransfersList'
import type { SentTransferItem } from './SentTransfersList'
import { MessageInbox }          from './MessageInbox'
import { SentMessages }          from './SentMessages'
import { useUnreadCount }        from '@/hooks/useUnreadCount'
import { CommsBadge }            from './CommsBadge'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MainTab         = 'transfers' | 'messages'
type TransferSubTab  = 'inbox' | 'sent'
type MessageSubTab   = 'inbox' | 'sent'

// Structurally compatible with TransferInbox's internal TransferItem type
interface ReceivedTransferItem {
  id:             string
  subject:        string
  message:        string | null
  status:         'PENDING' | 'DOWNLOADED' | 'RESPONDED' | 'COMPLETED' | 'EXPIRED'
  totalFiles:     number
  totalSize:      number
  expiresAt:      string
  createdAt:      string
  isPinProtected: boolean
  sender: { id: string; username: string | null; name: string | null; email: string | null }
}

interface Props {
  initialTab:       MainTab
  initialTransferSubTab?: TransferSubTab
  initialMessageSubTab?: MessageSubTab
  isAdmin:          boolean
  /** true for ADMIN and EDITOR — controls New Transfer button + Sent sub-tab */
  canSendTransfer:  boolean
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CommunicationsHub({
  initialTab,
  initialTransferSubTab = 'inbox',
  initialMessageSubTab = 'inbox',
  isAdmin,
  canSendTransfer,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const routeState = useMemo(() => {
    if (!mounted) {
      return {
        activeTab: initialTab,
        transferSubTab: initialTransferSubTab,
        msgSubTab: initialMessageSubTab,
      }
    }

    const pathParts = pathname?.split('/').filter(Boolean) ?? []
    const activeTab: MainTab =
      pathParts[0] === 'communications'
        ? (pathParts[1] === 'messages' ? 'messages' : 'transfers')
        : initialTab
    const transferSubTab: TransferSubTab =
      pathParts[0] === 'communications' && activeTab === 'transfers'
        ? (pathParts[2] === 'sent' ? 'sent' : 'inbox')
        : initialTransferSubTab
    const msgSubTab: MessageSubTab =
      pathParts[0] === 'communications' && activeTab === 'messages'
        ? (pathParts[2] === 'sent' ? 'sent' : 'inbox')
        : initialMessageSubTab

    return { activeTab, transferSubTab, msgSubTab }
  }, [mounted, pathname, initialTab, initialTransferSubTab, initialMessageSubTab])

  const { activeTab, transferSubTab, msgSubTab } = routeState

  // â”€â”€ Shared unread counts via the centralised hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // baseTitle is null here â€” the Sidebar instance owns the document.title update
  const { transfers: transfersBadge, messages: messagesBadge, urgent: hasUrgent } =
    useUnreadCount({ baseTitle: null })

  // Derive total transfers for the unified empty state
  const [totalTransfers, setTotalTransfers] = useState<number | null>(null)

  // Transfer inbox data (received)
  const [receivedTransfers, setReceivedTransfers] = useState<ReceivedTransferItem[]>([])
  const [receivedLoading,   setReceivedLoading]   = useState(false)
  const [receivedFetched,   setReceivedFetched]   = useState(false)

  // Admin sent transfers data
  const [sentTransfers, setSentTransfers] = useState<SentTransferItem[]>([])
  const [sentLoading,   setSentLoading]   = useState(false)
  const [sentFetched,   setSentFetched]   = useState(false)

  // â”€â”€â”€ Transfer data loading (lazy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadReceived = useCallback(async () => {
    if (receivedFetched) return
    setReceivedLoading(true)
    try {
      const res  = await fetch('/api/transfers/inbox')
      if (!res.ok) return
      const data = await res.json()
      const list = (data.transfers ?? []) as ReceivedTransferItem[]
      setReceivedTransfers(list)
      if (!canSendTransfer) setTotalTransfers(list.length)
    } catch { /* ignore */ } finally {
      setReceivedLoading(false)
      setReceivedFetched(true)
    }
  }, [receivedFetched, isAdmin])

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
    if (!canSendTransfer || transferSubTab === 'inbox') {
      loadReceived()
    } else {
      loadSent()
    }
  }, [activeTab, isAdmin, canSendTransfer, transferSubTab, loadReceived, loadSent])

  // â”€â”€â”€ Tab switching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const syncUrl = useCallback((tab: MainTab, subTab: string) => {
    router.replace(`/communications/${tab}/${subTab}`, { scroll: false })
  }, [router])

  const switchTab = (tab: MainTab) => {
    syncUrl(tab, tab === 'transfers' ? transferSubTab : msgSubTab)
  }

  // â”€â”€â”€ Unified empty state for non-admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const isUnifiedEmpty =
    !canSendTransfer &&
    totalTransfers === 0 &&
    messagesBadge  === 0 &&
    receivedFetched &&
    receivedTransfers.length === 0

  // CSS class passed to MessageInbox / SentMessages so they fill the hub container
  const FILL_CLASS = 'flex h-full overflow-hidden'

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl overflow-hidden
                    border border-slate-800/70 bg-slate-900">
      {/* â”€â”€ Main tab bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="shrink-0 flex items-center justify-between gap-2
                      px-3 py-2 border-b border-slate-800/70 bg-slate-950/60">

        <div className="flex items-center gap-0.5">
          <TabBtn
            active={activeTab === 'transfers'}
            onClick={() => switchTab('transfers')}
            label="Transfers"
            icon={<FolderInput className="w-4 h-4" />}
          >
            <CommsBadge count={transfersBadge} />
          </TabBtn>
          <TabBtn
            active={activeTab === 'messages'}
            onClick={() => switchTab('messages')}
            label="Messages"
            icon={<MessageSquare className="w-4 h-4" />}
          >
            <CommsBadge count={messagesBadge} urgent={hasUrgent} />
          </TabBtn>
        </div>

        {/* Action button — transfers: ADMIN+EDITOR; messages: all roles */}
        {(activeTab === 'transfers' ? canSendTransfer : true) && (
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

      {/* â”€â”€ Content area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <HubIntroCard
          activeTab={activeTab}
          transferSubTab={transferSubTab}
          messageSubTab={msgSubTab}
          transfersBadge={transfersBadge}
          messagesBadge={messagesBadge}
          canSendTransfer={canSendTransfer}
        />

        {isUnifiedEmpty ? (
          <UnifiedEmptyState />

        ) : activeTab === 'transfers' ? (
          <TransferTabContent
            isAdmin={isAdmin}
            canSendTransfer={canSendTransfer}
            subTab={transferSubTab}
            setSubTab={(s) => {
              syncUrl('transfers', s)
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
            subTab={msgSubTab}
            setSubTab={(s) => {
              syncUrl('messages', s)
            }}
            messagesBadge={messagesBadge}
            hasUrgent={hasUrgent}
            fillClass={FILL_CLASS}
          />
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ Transfers tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TransferTabContent({
  isAdmin, canSendTransfer, subTab, setSubTab,
  receivedTransfers, receivedLoading,
  sentTransfers, sentLoading,
  transfersBadge,
}: {
  isAdmin:          boolean
  canSendTransfer:  boolean
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
      {canSendTransfer && (
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
            badge={subTab !== 'sent' ? transfersBadge : 0}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {(!canSendTransfer || subTab === 'inbox') ? (
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

// â”€â”€â”€ Messages tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MessageTabContent({
  subTab, setSubTab,
  messagesBadge, hasUrgent, fillClass,
}: {
  subTab:        MessageSubTab
  setSubTab:     (s: MessageSubTab) => void
  messagesBadge: number
  hasUrgent:     boolean
  fillClass:     string
}) {
  return (
    <>
      {/* All roles see Inbox + Sent sub-tabs */}
      <div className="shrink-0 flex items-center gap-0.5
                      px-3 py-2 border-b border-slate-800/50 bg-slate-900">
        <SubTabBtn
          active={subTab === 'inbox'}
          onClick={() => setSubTab('inbox')}
          label="Inbox"
          badge={subTab !== 'inbox' ? messagesBadge : 0}
          urgent={subTab !== 'inbox' ? hasUrgent : false}
        />
        <SubTabBtn
          active={subTab === 'sent'}
          onClick={() => setSubTab('sent')}
          label="Sent"
        />
      </div>

      {/* Split-pane message component fills all remaining height */}
      <div className="flex-1 overflow-hidden min-h-0">
        {subTab === 'inbox' ? (
          <MessageInbox className={fillClass} />
        ) : (
          <SentMessages className={fillClass} />
        )}
      </div>
    </>
  )
}

// â”€â”€â”€ Shared mini-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TabBtn({
  active, onClick, label, icon, children,
}: {
  active:    boolean
  onClick:   () => void
  label:     string
  icon:      React.ReactNode
  children?: React.ReactNode
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
      {children}
    </button>
  )
}

function SubTabBtn({
  active, onClick, label, badge = 0, urgent = false,
}: {
  active:   boolean
  onClick:  () => void
  label:    string
  badge?:   number
  urgent?:  boolean
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
      <CommsBadge count={badge} urgent={urgent} />
    </button>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
      Loadingâ€¦
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

function HubIntroCard({
  activeTab,
  transferSubTab,
  messageSubTab,
  transfersBadge,
  messagesBadge,
  canSendTransfer,
}: {
  activeTab: MainTab
  transferSubTab: TransferSubTab
  messageSubTab: MessageSubTab
  transfersBadge: number
  messagesBadge: number
  canSendTransfer: boolean
}) {
  const copy =
    activeTab === 'transfers'
      ? transferSubTab === 'sent'
        ? {
            title: 'Track every file transfer clearly',
            text: 'See what you have already sent, what still needs downloading, and which recipients have responded.',
            badge: `${transfersBadge} active transfer alerts`,
            icon: <ArrowLeftRight className="h-4 w-4" />,
          }
        : {
            title: 'Files shared with you appear here first',
            text: 'Open any transfer to download the files, respond, or continue editing work without hunting through the system.',
            badge: `${transfersBadge} transfer alerts`,
            icon: <Inbox className="h-4 w-4" />,
          }
      : messageSubTab === 'sent'
        ? {
            title: 'Review messages you have already sent',
            text: 'Follow up on updates and keep your communication history easy to understand.',
            badge: `${messagesBadge} message alerts`,
            icon: <MessageSquare className="h-4 w-4" />,
          }
        : {
            title: 'Important communication stays easy to find',
            text: 'Unread and urgent messages surface here so normal users can act quickly.',
            badge: `${messagesBadge} unread messages`,
            icon: <MessageSquare className="h-4 w-4" />,
          }

  return (
    <div className="border-b border-slate-800/60 bg-gradient-to-r from-indigo-500/10 via-slate-900 to-slate-900 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300">
            {copy.icon}
            {copy.badge}
          </div>
          <h2 className="mt-3 text-lg font-semibold text-white">{copy.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{copy.text}</p>
        </div>

        {activeTab === 'transfers' && canSendTransfer && (
          <Link
            href="/transfers/new"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-indigo-500/20 bg-indigo-600/15 px-3.5 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-600/25"
          >
            Start a guided transfer
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
