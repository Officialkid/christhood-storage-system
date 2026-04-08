'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { MessageCircle, X, Send, Bot, WifiOff, Zap, Loader2 } from 'lucide-react'
import { SUGGESTED_QUESTIONS } from '@/lib/assistant/system-prompt'
import {
  type ActionWarning,
  ActionRiskLevel,
  RISK_STYLES,
} from '@/lib/assistant/safety/action-classifier'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ConfirmationState = 'pending' | 'loading' | 'confirmed' | 'cancelled' | 'expired'

interface Message {
  id:                   string
  role:                 'user' | 'assistant'
  content:              string
  streaming?:           boolean
  // Confirmation card fields — set when the API requires user confirmation
  isConfirmation?:      boolean
  confirmationMessage?: string
  pendingActionId?:     string
  confirmationState?:   ConfirmationState
  confirmationExpiry?:  number  // Date.now() + 5 min
  // Impact disclosure — populated from getActionWarning() on the server
  actionWarning?:       ActionWarning
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_MESSAGE: Message = {
  id:      'welcome',
  role:    'assistant',
  content: "Hi! I'm Zara, your Christhood CMMS assistant. I can help you with uploading, finding content, managing your account, and more. What do you need help with today? 😊",
}

// Prefix-based chip lookup: exact match first, then /segment prefix, then default.
function getChipsForPath(pathname: string): string[] {
  if (SUGGESTED_QUESTIONS[pathname]) return SUGGESTED_QUESTIONS[pathname]
  const prefix = '/' + pathname.split('/')[1]
  if (SUGGESTED_QUESTIONS[prefix]) return SUGGESTED_QUESTIONS[prefix]
  return SUGGESTED_QUESTIONS['default']
}

const LS_HINT_KEY     = 'cmms-chatbot-hint-shown'
const LS_PRIVACY_KEY  = 'cmms-zara-privacy-seen'

// Tool name → human-readable activity label
const TOOL_LABELS: Record<string, string> = {
  searchFiles:          'Searching files...',
  getEventContents:     'Looking up event contents...',
  getUserActivity:      'Checking user activity...',
  getFileDetails:       'Getting file details...',
  getRecentActivity:    'Reading activity log...',
  getStorageStats:      'Checking storage...',
  getTrashContents:     'Checking trash...',
  findUser:             'Looking up user...',
  getTransferStatus:    'Checking transfer...',
  restoreFileFromTrash: 'Preparing restore...',
  resetUserPassword:    'Preparing password reset...',
  unlockUserAccount:    'Checking account status...',
  changeFileStatus:     'Preparing status change...',
  createEvent:          'Preparing event creation...',
  flagIssueToAdmin:     'Notifying admin...',
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatbotWidget() {
  const pathname          = usePathname()
  const { data: session } = useSession()

  // Don't render on public gallery pages or ShareLink — no CMMS branding there
  if (pathname.startsWith('/gallery-public')) return null
  if (pathname.startsWith('/public-share'))  return null

  const [isOpen, setIsOpen]           = useState(false)
  const [showPulse, setShowPulse]     = useState(false)
  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [isStreaming, setIsStreaming]      = useState(false)
  const [isOffline, setIsOffline]         = useState(false)
  const [toolActivity, setToolActivity]   = useState<string | null>(null)
  // CRITICAL action confirmation: per-message typed input and countdown
  const [criticalInputs, setCriticalInputs]         = useState<Record<string, string>>({})
  const [criticalCountdowns, setCriticalCountdowns] = useState<Record<string, number | null>>({})
  // Stable session ID: generated once per widget mount, never changes while the
  // chat is open. Passed to /api/assistant so logs can be grouped by session.
  const sessionIdRef                  = useRef(crypto.randomUUID())
  // One-per-session flag tracked via ref so it is never stale in closures.
  const healthCheckedRef              = useRef(false)

  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)
  // Chips are seeded from the current path and update on navigation,
  // but only while the conversation is still on the welcome message.
  const [chips, setChips] = useState<string[]>(() => getChipsForPath(''))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLInputElement>(null)

  // ── CRITICAL countdown: once the user types "CONFIRM", start a 5-second delay
  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = []
    for (const [msgId, val] of Object.entries(criticalInputs)) {
      if (val === 'CONFIRM' && criticalCountdowns[msgId] === undefined) {
        // Initialise the countdown at 5
        setCriticalCountdowns(prev => ({ ...prev, [msgId]: 5 }))
      }
    }
    // Decrement any active countdowns
    for (const [msgId, count] of Object.entries(criticalCountdowns)) {
      if (typeof count === 'number' && count > 0) {
        const t = setInterval(() => {
          setCriticalCountdowns(prev => {
            const current = prev[msgId]
            if (typeof current !== 'number' || current <= 0) {
              clearInterval(t)
              return prev
            }
            return { ...prev, [msgId]: current - 1 }
          })
        }, 1000)
        timers.push(t)
      }
    }
    return () => timers.forEach(clearInterval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalInputs])

  // ── On mount: show pulse ring only for first-time visitors ────────────────
  useEffect(() => {
    if (!localStorage.getItem(LS_HINT_KEY)) setShowPulse(true)
  }, [])

  // ── Sync chips to the current page, but only on the welcome screen ────────
  // Once the user starts a real conversation (messages.length > 1) the chips
  // are hidden anyway, so there's no need to keep updating them.
  useEffect(() => {
    if (messages.length <= 1) {
      setChips(getChipsForPath(pathname))
    }
  }, [pathname, messages.length])

  // ── Health check — silent GET ping, fires once per session on first open ──
  const runHealthCheck = async () => {
    if (healthCheckedRef.current) return
    healthCheckedRef.current = true
    try {
      const res = await fetch('/api/assistant/health', { method: 'GET' })
      setIsOffline(!res.ok)
    } catch {
      setIsOffline(true)
    }
  }

  // ── Auto-scroll to the latest message whenever messages change ────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Focus the input field whenever the panel opens ────────────────────────
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // ── Open chat ─────────────────────────────────────────────────────────────
  const openChat = () => {
    setIsOpen(true)
    // Inject the welcome message the first time the panel is opened
    if (messages.length === 0) {
      setMessages([{ ...WELCOME_MESSAGE }])
    }
    // Remove the pulse ring once the user opens the chat
    if (showPulse) {
      setShowPulse(false)
      localStorage.setItem(LS_HINT_KEY, '1')
    }
    // Show the one-time privacy notice if the user hasn't seen it yet
    if (!localStorage.getItem(LS_PRIVACY_KEY)) {
      setShowPrivacyNotice(true)
    }
    // Run health check silently once per browser session
    runHealthCheck()
  }

  const closeChat = () => setIsOpen(false)

  // ── Core: send a message and stream the response ──────────────────────────
  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setInput('')

    // Build the history array to send: all completed messages + the new user turn.
    // We snapshot `messages` here (closure is intentional — we want the state
    // at the moment the user pressed send, before the setter runs).
    const historyToSend = [
      ...messages
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: trimmed },
    ]

    const userMsg: Message = {
      id:   crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }
    const streamId  = crypto.randomUUID()
    const streamMsg: Message = {
      id:       streamId,
      role:     'assistant',
      content:  '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, streamMsg])
    setIsStreaming(true)

    try {
      const userName = (session?.user as { name?: string } | undefined)?.name ?? 'there'
      const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'team member'

      const res = await fetch('/api/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:    historyToSend,
          currentPage: pathname,
          sessionId:   sessionIdRef.current,
          context: {
            userName,
            userRole,
            currentPage: pathname,
          },
        }),
      })

      // Non-2xx — read the error body and display it
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        let errText: string
        if (res.status === 401) {
          errText = "It looks like your session expired — please refresh the page and log in again."
        } else if (res.status === 429) {
          errText = typeof data?.error === 'string'
            ? data.error
            : "You've sent a lot of messages! Give it a minute and try again 😄"
        } else {
          errText = typeof data?.error === 'string'
            ? data.error
            : `Something went wrong (${res.status}). Please try again.`
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === streamId ? { ...m, content: errText, streaming: false } : m
          )
        )
        return
      }

      // ── SSE streaming ─────────────────────────────────────────────────────
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on newlines; keep any incomplete trailing line in the buffer
        const lines  = buffer.split('\n')
        buffer       = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()

          if (raw === '[DONE]') break outer

          try {
            const parsed = JSON.parse(raw)

            // Normal text delta
            if (typeof parsed.token === 'string') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamId
                    ? { ...m, content: m.content + parsed.token }
                    : m
                )
              )
            }

            // Tool activity indicator (shown while a read-tool is executing)
            if (parsed.type === 'tool_executing' && typeof parsed.toolName === 'string') {
              setToolActivity(TOOL_LABELS[parsed.toolName] ?? 'Checking...')
            }

            // Confirmation required — surface an action card and stop streaming
            if (parsed.type === 'confirmation_required') {
              setToolActivity(null)
              const expiry = Date.now() + 5 * 60 * 1000
              setMessages(prev => prev.map(m =>
                m.id === streamId ? {
                  ...m,
                  streaming:           false,
                  isConfirmation:      true,
                  confirmationMessage: parsed.message,
                  pendingActionId:     parsed.pendingActionId,
                  confirmationState:   'pending',
                  confirmationExpiry:  expiry,
                  actionWarning:       parsed.actionWarning ?? undefined,
                } : m
              ))
              break outer
            }

            // Error sent through the stream (e.g. Gemini API down)
            if (typeof parsed.error === 'string') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamId
                    ? { ...m, content: parsed.error, streaming: false }
                    : m
                )
              )
              break outer
            }
          } catch {
            // Malformed JSON chunk — skip silently
          }
        }
      }

      // Mark the streaming message as complete
      setMessages(prev =>
        prev.map(m => (m.id === streamId ? { ...m, streaming: false } : m))
      )
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === streamId
            ? {
                ...m,
                content:
                  "I'm having trouble connecting right now. Please check your internet and try again.",
                streaming: false,
              }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
      setToolActivity(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  // ── Confirm a pending action (two-step confirmation flow) ─────────────────
  const handleConfirm = async (msg: Message) => {
    if (!msg.pendingActionId) return
    // Mark card as loading
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, confirmationState: 'loading' } : m
    ))
    // Create a new streaming message that will hold the result
    const resultId  = crypto.randomUUID()
    const resultMsg: Message = { id: resultId, role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, resultMsg])
    setIsStreaming(true)
    try {
      const res = await fetch('/api/assistant/confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pendingActionId: msg.pendingActionId }),
      })
      if (!res.ok || !res.body) throw new Error('Request failed')
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break outer
          try {
            const parsed = JSON.parse(raw)
            if (typeof parsed.token === 'string') {
              setMessages(prev => prev.map(m =>
                m.id === resultId ? { ...m, content: m.content + parsed.token } : m
              ))
            }
            if (typeof parsed.error === 'string') {
              setMessages(prev => prev.map(m =>
                m.id === resultId ? { ...m, content: parsed.error, streaming: false } : m
              ))
              break outer
            }
          } catch { /* skip malformed */ }
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === msg.id    ? { ...m, confirmationState: 'confirmed' } :
        m.id === resultId  ? { ...m, streaming: false } : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === msg.id   ? { ...m, confirmationState: 'confirmed' } :
        m.id === resultId ? { ...m, content: "Something went wrong while executing that action. Please try again.", streaming: false } : m
      ))
    } finally {
      setIsStreaming(false)
    }
  }

  // ── Cancel a pending action (no server call needed) ───────────────────────
  const handleCancel = (msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, confirmationState: 'cancelled' }
        : m
    ))
  }

  // Show chips only while the conversation is still at the welcome message
  // (exactly 1 assistant message, no user messages yet)
  const showChips = messages.length === 1 && messages[0].role === 'assistant'

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      <div
        className={[
          // Layout
          'fixed z-[60] flex flex-col bg-white shadow-2xl border border-slate-200 overflow-hidden',
          // Mobile: nearly full-screen, leaving room for the FAB below
          'inset-x-3 top-14 bottom-24 rounded-2xl',
          // sm+: anchored to bottom-right, capped at 560px but never taller than the viewport
          'sm:inset-auto sm:bottom-20 sm:right-6 sm:top-auto sm:w-[22rem] sm:h-[min(560px,calc(100vh-6rem))]',
          // Open / close animation
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none',
          'transition-all duration-300 ease-in-out',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="CMMS Assistant"
        aria-hidden={!isOpen}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 shrink-0">
            <Bot size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-none">CMMS Assistant</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Here to help</p>
          </div>
          <button
            onClick={closeChat}
            className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Offline banner ──────────────────────────────────────────── */}
        {isOffline && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
            <WifiOff size={13} className="shrink-0 text-amber-600" />
            <span>The assistant is currently offline. Please try again later or contact your admin.</span>
          </div>
        )}

        {/* ── Privacy Notice Banner ────────────────────────────────────── */}
        {showPrivacyNotice && (
          <div className="shrink-0 mx-4 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
            <p className="font-semibold mb-1">👋 About Zara&apos;s conversation logs</p>
            <p className="mb-2 leading-relaxed">
              To improve Zara over time, anonymised summaries of conversations may be
              saved — with your name, email, and other personal details removed.
              You can opt out at any time in your <strong>Profile → Privacy settings</strong>.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/user/zara-logging-opt-out', {
                      method:  'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body:    JSON.stringify({ optOut: true }),
                    })
                  } catch { /* silently ignore */ }
                  localStorage.setItem(LS_PRIVACY_KEY, '1')
                  setShowPrivacyNotice(false)
                }}
                className="px-3 py-1 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                Opt out of logging
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(LS_PRIVACY_KEY, '1')
                  setShowPrivacyNotice(false)
                }}
                className="px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Got it, let&apos;s chat
              </button>
            </div>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 scroll-smooth">
          {messages.map(msg => (
            <div key={msg.id}>
              {/* Message row */}
              <div
                className={[
                  'flex items-end gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                ].join(' ')}
              >
                {/* Bot avatar — shown left of every assistant bubble */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 shrink-0 mb-0.5">
                    <Bot size={11} className="text-indigo-600" />
                  </div>
                )}

                {/* Bubble / confirmation card */}
                {msg.isConfirmation ? (
                  /* ── Enhanced Action Confirmation Card ─────────────────────── */
                  (() => {
                    const aw      = msg.actionWarning
                    const risk    = aw?.riskLevel ?? ActionRiskLevel.MODERATE
                    const style   = RISK_STYLES[risk]
                    const isCritical = style.requiresTypedConfirm
                    const critInput  = criticalInputs[msg.id] ?? ''
                    const countdown  = criticalCountdowns[msg.id] ?? null
                    const critReady  = isCritical
                      ? (critInput === 'CONFIRM' && countdown === 0)
                      : true

                    return (
                      <div className={`max-w-[90%] rounded-2xl rounded-bl-sm border-2 ${style.cardBorder} ${style.cardBg} p-3.5 shadow-sm`}>

                        {/* ─ Header ─────────────────────────────────────────── */}
                        <div className="flex items-start gap-2 mb-2.5">
                          <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
                            {style.headerIcon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold leading-snug ${style.headlineColor}`}>
                              {aw?.headline ?? '⚡ Action Required'}
                            </p>
                            <span className={[
                              'inline-block text-[9px] uppercase tracking-widest font-bold mt-1 px-1.5 py-0.5 rounded',
                              risk === ActionRiskLevel.SAFE      ? 'bg-green-100 text-green-700' :
                              risk === ActionRiskLevel.MODERATE  ? 'bg-blue-100 text-blue-700'  :
                              risk === ActionRiskLevel.SENSITIVE ? 'bg-amber-100 text-amber-700' :
                              risk === ActionRiskLevel.HIGH      ? 'bg-orange-100 text-orange-700' :
                                                                   'bg-red-100 text-red-700',
                            ].join(' ')}>
                              {risk} risk
                            </span>
                          </div>
                        </div>

                        {/* ─ State-specific content ──────────────────────── */}
                        {msg.confirmationState === 'pending' && (
                          <>
                            {/* Zara's confirmation message */}
                            <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap leading-relaxed">
                              {msg.confirmationMessage}
                            </p>

                            {/* What will happen */}
                            {aw && (
                              <div className="space-y-2.5 mb-3">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">What will happen</p>
                                  <ul className="space-y-0.5">
                                    {aw.whatWillHappen.map((item, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                                        <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">What stays the same</p>
                                  <ul className="space-y-0.5">
                                    {aw.whatWillNOTHappen.map((item, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                                        <span className="mt-0.5 shrink-0">○</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Can be undone */}
                                <div className="text-xs">
                                  <span className={aw.canBeUndone ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                                    {aw.canBeUndone ? '↩ Reversible' : '⚠ Permanent'}
                                  </span>
                                  {aw.howToUndo && (
                                    <p className="text-slate-500 mt-0.5">{aw.howToUndo}</p>
                                  )}
                                </div>

                                {/* Preservation note */}
                                {aw.preservationNote && (
                                  <p className="text-[10px] text-slate-400 italic border-t border-slate-200 pt-2">
                                    🔒 {aw.preservationNote}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* CRITICAL: type-to-confirm input + countdown */}
                            {isCritical && (
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-red-700 mb-1.5">
                                  Type <strong>CONFIRM</strong> below to unlock this action:
                                </p>
                                <input
                                  type="text"
                                  value={critInput}
                                  onChange={e => {
                                    const v = e.target.value.toUpperCase()
                                    setCriticalInputs(prev => ({ ...prev, [msg.id]: v }))
                                    // Reset countdown if they clear the input
                                    if (v !== 'CONFIRM') {
                                      setCriticalCountdowns(prev => ({ ...prev, [msg.id]: null }))
                                    }
                                  }}
                                  placeholder="Type CONFIRM…"
                                  className="w-full text-xs px-3 py-2 rounded-lg border-2 border-red-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 font-mono tracking-wider"
                                />
                                {typeof countdown === 'number' && countdown > 0 && (
                                  <p className="text-xs text-red-600 mt-1.5 font-medium">
                                    Wait {countdown}s before confirming…
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => critReady && handleConfirm(msg)}
                                disabled={isStreaming || !critReady}
                                className={[
                                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                                  isCritical
                                    ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed',
                                ].join(' ')}
                              >
                                ✓ Yes, go ahead
                              </button>
                              <button
                                onClick={() => handleCancel(msg.id)}
                                disabled={isStreaming}
                                className="text-xs px-3 py-1.5 rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                ✗ No, cancel
                              </button>
                            </div>
                          </>
                        )}

                        {msg.confirmationState === 'loading' && (
                          <div className="flex items-center gap-2 text-indigo-600 text-sm">
                            <Loader2 size={14} className="animate-spin shrink-0" />
                            <span>Executing action…</span>
                          </div>
                        )}
                        {msg.confirmationState === 'confirmed' && (
                          <p className="text-xs text-slate-400 italic">Action completed.</p>
                        )}
                        {msg.confirmationState === 'cancelled' && (
                          <p className="text-sm text-slate-500">No problem — the action was cancelled. Is there anything else I can help with? 😊</p>
                        )}
                        {msg.confirmationState === 'expired' && (
                          <p className="text-xs text-slate-400 italic">This action expired. Please ask again.</p>
                        )}
                      </div>
                    )
                  })()
                ) : (
                  <div
                    className={[
                      'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm',
                    ].join(' ')}
                  >
                    {/* Typing indicator: animated dots + label while waiting for first token */}
                    {msg.streaming && msg.content === '' ? (
                      <span className="flex flex-col gap-1.5 px-1 py-0.5">
                        <span className="flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]"   />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                          </span>
                          <span className="text-[11px] text-slate-400 italic">
                            {toolActivity ? 'Zara is checking the system…' : 'Zara is thinking…'}
                          </span>
                        </span>
                        {/* Tool activity pill */}
                        {toolActivity && (
                          <span className="flex items-center gap-1 text-[11px] text-indigo-500 pl-0.5">
                            <span className="animate-pulse">🔍</span>
                            <span>{toolActivity}</span>
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Quick-start chips — appear below the welcome message only */}
              {showChips && msg.id === 'welcome' && (
                <div className="mt-3 flex flex-wrap gap-2 pl-8">
                  {chips.map(chip => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={isStreaming}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Invisible anchor — auto-scroll always lands here */}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ───────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 flex items-center gap-2 px-3 py-3 border-t border-slate-200 bg-white"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={isStreaming}
            autoComplete="off"
            className="flex-1 text-sm px-3.5 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* ── Floating Action Button ───────────────────────────────────────── */}
      <div data-tour="chatbot-fab" className="fixed bottom-8 right-5 sm:right-6 z-[60]">
        {/* Pulse ring — a faint expanding ring shown on first visit */}
        {showPulse && !isOpen && (
          <span
            className="absolute inset-0 rounded-full bg-indigo-500 opacity-40 animate-ping"
            aria-hidden="true"
          />
        )}

        <button
          onClick={isOpen ? closeChat : openChat}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close help chat' : 'Open help chat'}
          className="relative flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-200 font-medium text-sm"
        >
          {isOpen
            ? <X size={18} />
            : <><MessageCircle size={18} /><span>Help</span></>
          }
        </button>
      </div>
    </>
  )
}
