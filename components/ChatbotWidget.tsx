'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X, Send, Bot } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm the CMMS Assistant. I can help you with anything in the system — uploading, downloading, finding content, managing your account, and more. What do you need help with?",
}

// ─────────────────────────────────────────────────────────────────────────────
// Context-aware quick-start chips
// Returns the most relevant suggested questions for the user's current page.
// Matches are tried from most-specific to least-specific.
// ─────────────────────────────────────────────────────────────────────────────
function getChipsForPath(path: string): string[] {
  // Upload inside an event — most specific, check before /events/[id]
  if (/^\/events\/[^/]+\/upload/.test(path)) return [
    'How do I upload files?',
    'What happens if my upload stops?',
    'Will my files be renamed?',
  ]

  // Individual event view
  if (/^\/events\/[^/]+/.test(path)) return [
    'How do I download all files?',
    'What do the status labels mean?',
    'How do tags work?',
  ]

  // Exact and prefix matches
  if (path === '/dashboard' || path === '/') return [
    'What can I do here?',
    'How do I follow an event?',
    'What do my notifications mean?',
  ]

  if (path === '/events') return [
    'How is the folder structure organized?',
    'What are the event categories?',
    'How do I find a specific event?',
  ]

  if (path === '/search') return [
    'How do I filter search results?',
    'What can I search by?',
    'How do tags help with searching?',
  ]

  if (path === '/admin/users') return [
    'How do I create a new user?',
    'What is the difference between roles?',
    "How do I reset someone's password?",
  ]

  if (path === '/admin/trash') return [
    'How long do deleted files stay here?',
    'How do I restore a file?',
    'Who can delete files?',
  ]

  if (path === '/admin/logs' || path === '/admin/activity-log') return [
    'What actions are tracked?',
    'Can I filter the log?',
    'Can entries be deleted?',
  ]

  if (path === '/profile') return [
    'How do I change my password?',
    'How do I manage notifications?',
    'How do I install the app?',
  ]

  // Default
  return [
    'How do I upload files?',
    'What do the file statuses mean?',
    'How do I install the app on my phone?',
    'How do I download a whole folder?',
  ]
}

const LS_HINT_KEY = 'cmms-chatbot-hint-shown'

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatbotWidget() {
  const pathname = usePathname()

  const [isOpen, setIsOpen]       = useState(false)
  const [showPulse, setShowPulse] = useState(false)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  // Chips are seeded from the current path and update on navigation,
  // but only while the conversation is still on the welcome message.
  const [chips, setChips] = useState<string[]>(() => getChipsForPath(''))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLInputElement>(null)

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
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyToSend, currentPage: pathname }),
      })

      // Non-2xx — read the error body and display it
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        let errText: string
        if (res.status === 401) {
          errText = 'You need to be signed in to use the assistant. Please refresh the page and log in first.'
        } else if (res.status === 429) {
          errText = typeof data?.error === 'string' ? data.error : 'You have sent too many messages. Please wait a while before trying again.'
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
            if (typeof parsed.text === 'string') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamId
                    ? { ...m, content: m.content + parsed.text }
                    : m
                )
              )
            }

            // Error sent through the stream (e.g. Anthropic API down)
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
                  'I am having trouble connecting right now — please try again in a moment or contact your admin.',
                streaming: false,
              }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
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

                {/* Bubble */}
                <div
                  className={[
                    'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm',
                  ].join(' ')}
                >
                  {/* Typing indicator: animated dots while waiting for first token */}
                  {msg.streaming && msg.content === '' ? (
                    <span className="flex gap-1 items-center px-1 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]"   />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>

              {/* Quick-start chips — appear below the welcome message only */}
              {showChips && msg.id === 'welcome' && (
                <div className="mt-3 flex flex-wrap gap-2 pl-8">
                  {chips.map(chip => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={isStreaming}
                      className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
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
