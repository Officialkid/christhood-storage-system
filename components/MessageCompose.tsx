'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send, Bold, Italic, List, AlertTriangle, Users, Radio,
  ChevronDown, X, Paperclip, ShieldCheck, Clock, CheckCircle2,
  Loader2, FileStack, Search, RefreshCcw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchUser {
  id:       string
  username: string | null
  name:     string | null
  email:    string
  role:     string
}

interface AttachableTransfer {
  id:         string
  subject:    string
  totalFiles: number
  status:     string
  createdAt:  string
  recipient:  { username: string | null; name: string | null; email: string }
}

type Priority      = 'NORMAL' | 'URGENT'
type RecipientMode = 'specific' | 'broadcast'
type BroadcastRole = 'UPLOADER' | 'EDITOR' | 'ALL'

const BROADCAST_OPTIONS: { value: BroadcastRole; label: string; desc: string }[] = [
  { value: 'UPLOADER', label: 'Uploaders', desc: 'All users with Uploader role' },
  { value: 'EDITOR',   label: 'Editors',   desc: 'All users with Editor role'   },
  { value: 'ALL',      label: 'Everyone',  desc: 'All team members'             },
]

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  PENDING:    'Pending',
  DOWNLOADED: 'Downloaded',
  RESPONDED:  'Responded',
  COMPLETED:  'Completed',
  EXPIRED:    'Expired',
}

function displayName(u: { username: string | null; name: string | null; email: string }) {
  return u.username ?? u.name ?? u.email
}

// ─── Simple markdown → HTML renderer (safe — only admin-typed content) ───────

function renderMarkdown(text: string): string {
  if (!text) return '<p class="text-slate-500">Your message will appear here…</p>'

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines   = escaped.split('\n')
  const result: string[] = []
  let inList    = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { result.push('<ul style="list-style:disc;padding-left:1.25rem;margin:0.5rem 0;">'); inList = true }
      result.push(`<li style="margin:0.15rem 0;">${applyInline(line.slice(2))}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      if (line === '') {
        result.push('<br>')
      } else {
        result.push(`<p style="margin:0.2rem 0;">${applyInline(line)}</p>`)
      }
    }
  }

  if (inList) result.push('</ul>')
  return result.join('')
}

function applyInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,      '<em>$1</em>')
    .replace(/__(.+?)__/g,      '<strong>$1</strong>')
    .replace(/_(.+?)_/g,        '<em>$1</em>')
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
    EDITOR:   'bg-blue-500/20  text-blue-300  border-blue-500/30',
    UPLOADER: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  )
}

function TransferStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING:    'bg-amber-500/15 text-amber-300',
    DOWNLOADED: 'bg-blue-500/15  text-blue-300',
    RESPONDED:  'bg-violet-500/15 text-violet-300',
    COMPLETED:  'bg-emerald-500/15 text-emerald-300',
    EXPIRED:    'bg-red-500/15  text-red-300',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] ?? 'bg-slate-700 text-slate-400'}`}>
      {TRANSFER_STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MessageCompose({ senderName, isAdmin }: { senderName: string; isAdmin: boolean }) {
  const router = useRouter()

  // ── Form state ─────────────────────────────────────────────────────────────
  const [subject,       setSubject]       = useState('')
  const [body,          setBody]          = useState('')
  const [priority,      setPriority]      = useState<Priority>('NORMAL')
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('specific')

  // Specific users mode
  const [selectedUsers,  setSelectedUsers]  = useState<SearchUser[]>([])
  const [userQuery,      setUserQuery]      = useState('')
  const [userResults,    setUserResults]    = useState<SearchUser[]>([])
  const [userSearching,  setUserSearching]  = useState(false)
  const [showDropdown,   setShowDropdown]   = useState(false)

  // Broadcast mode
  const [broadcastRole,  setBroadcastRole]  = useState<BroadcastRole>('UPLOADER')
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null)
  const [countLoading,   setCountLoading]   = useState(false)

  // Transfer attachment
  const [attachEnabled,       setAttachEnabled]       = useState(false)
  const [transferQuery,       setTransferQuery]       = useState('')
  const [transferResults,     setTransferResults]     = useState<AttachableTransfer[]>([])
  const [transferSearching,   setTransferSearching]   = useState(false)
  const [selectedTransfer,    setSelectedTransfer]    = useState<AttachableTransfer | null>(null)
  const [showTransferDrop,    setShowTransferDrop]    = useState(false)

  // Submit state
  const [sending,         setSending]     = useState(false)
  const [sendError,       setSendError]   = useState<string | null>(null)
  const [sendSuccess,     setSendSuccess] = useState(false)

  const bodyRef  = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── Broadcast count ────────────────────────────────────────────────────────
  const fetchBroadcastCount = useCallback(async (role: BroadcastRole) => {
    setCountLoading(true)
    try {
      const r = await fetch(`/api/messages/recipient-count?role=${role}`)
      const d = await r.json() as { count: number }
      setBroadcastCount(d.count)
    } catch { setBroadcastCount(null) }
    finally  { setCountLoading(false) }
  }, [])

  useEffect(() => {
    if (recipientMode === 'broadcast') fetchBroadcastCount(broadcastRole)
  }, [recipientMode, broadcastRole, fetchBroadcastCount])

  // ── User search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (userQuery.length < 2) { setUserResults([]); return }
    const id = setTimeout(async () => {
      setUserSearching(true)
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery)}`)
        const d = await r.json() as { users: SearchUser[] }
        setUserResults(d.users.filter((u) => !selectedUsers.some((s) => s.id === u.id)))
      } catch { /* silent */ }
      finally  { setUserSearching(false) }
    }, 280)
    return () => clearTimeout(id)
  }, [userQuery, selectedUsers])

  // ── Transfer search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attachEnabled) return
    const id = setTimeout(async () => {
      setTransferSearching(true)
      try {
        const q  = transferQuery ? `?q=${encodeURIComponent(transferQuery)}` : ''
        const r  = await fetch(`/api/messages/transfers${q}`)
        const d  = await r.json() as { transfers: AttachableTransfer[] }
        setTransferResults(d.transfers)
      } catch { /* silent */ }
      finally  { setTransferSearching(false) }
    }, 250)
    return () => clearTimeout(id)
  }, [attachEnabled, transferQuery])

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Formatting helpers ─────────────────────────────────────────────────────
  function insertFormat(before: string, after: string) {
    const ta = bodyRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const selected = body.slice(s, e) || 'text'
    const next     = body.slice(0, s) + before + selected + after + body.slice(e)
    setBody(next)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, s + before.length + selected.length)
    }, 0)
  }

  function insertBullet() {
    const ta = bodyRef.current
    if (!ta) return
    const { selectionStart: s } = ta
    const lineStart = body.lastIndexOf('\n', s - 1) + 1
    const next = body.slice(0, lineStart) + '- ' + body.slice(lineStart)
    setBody(next)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2) }, 0)
  }

  // ── Select helpers ─────────────────────────────────────────────────────────
  function addUser(u: SearchUser) {
    setSelectedUsers((prev) => [...prev, u])
    setUserQuery('')
    setUserResults([])
    setShowDropdown(false)
  }

  function removeUser(id: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id))
  }

  // ── Draft (localStorage) ───────────────────────────────────────────────────
  function saveDraft() {
    const draft = { subject, body, priority, recipientMode, broadcastRole,
                    selectedUsers, attachmentTransferId: selectedTransfer?.id ?? null }
    localStorage.setItem('msg-draft', JSON.stringify(draft))
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem('msg-draft')
      if (!raw) return
      const d = JSON.parse(raw) as typeof draft
      if (d.subject)       setSubject(d.subject)
      if (d.body)          setBody(d.body)
      if (d.priority)      setPriority(d.priority as Priority)
      // Only restore broadcast mode if the current user is an Admin
      if (d.recipientMode) setRecipientMode(
        d.recipientMode === 'broadcast' && !isAdmin ? 'specific' : d.recipientMode as RecipientMode
      )
      if (d.broadcastRole) setBroadcastRole(d.broadcastRole as BroadcastRole)
      if (d.selectedUsers) setSelectedUsers(d.selectedUsers as SearchUser[])
    } catch { /* corrupt draft → ignore */ }
  }
  const draft = { subject, body, priority, recipientMode, broadcastRole, selectedUsers, attachmentTransferId: selectedTransfer?.id ?? null }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function handleSend() {
    setSendError(null)
    const trimSub = subject.trim()
    const trimBody = body.trim()

    if (!trimSub)           return setSendError('Subject is required.')
    if (trimSub.length > 150) return setSendError('Subject too long (max 150 chars).')
    if (!trimBody)          return setSendError('Message body is required.')
    if (trimBody.length > 2000) return setSendError('Body too long (max 2000 chars).')

    if (recipientMode === 'specific' && selectedUsers.length === 0) {
      return setSendError('Add at least one recipient.')
    }

    setSending(true)
    try {
      const payload: Record<string, unknown> = {
        subject:  trimSub,
        body:     trimBody,
        priority,
        attachmentTransferId: selectedTransfer?.id ?? undefined,
      }
      if (recipientMode === 'broadcast') {
        payload.broadcastRole = broadcastRole
      } else {
        payload.recipientIds = selectedUsers.map((u) => u.id)
      }

      const res = await fetch('/api/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json() as { error?: string; id?: string; recipientCount?: number }
      if (!res.ok) { setSendError(data.error ?? 'Failed to send.'); return }

      localStorage.removeItem('msg-draft')
      setSendSuccess(true)
      // Go straight to Communications → Messages → Sent so the admin can see their message
      setTimeout(() => router.push('/communications/messages'), 2000)
    } catch {
      setSendError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // ── Recipient summary ──────────────────────────────────────────────────────
  const recipientSummary = recipientMode === 'specific'
    ? selectedUsers.length === 0
      ? 'No recipients selected'
      : `Sending to ${selectedUsers.length} ${selectedUsers.length === 1 ? 'person' : 'people'}`
    : broadcastCount === null
      ? 'Loading count…'
      : `Broadcasting to ${broadcastCount} ${broadcastCount === 1 ? 'person' : 'people'}`

  // ─────────────────────────────────────────────────────────────────────────
  if (sendSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Message Sent!</h2>
        <p className="text-sm text-slate-400 mb-1">
          Recipients will see it in their <strong className="text-white">Communications → Messages → Inbox</strong>.
        </p>
        <p className="text-xs text-slate-500">Taking you to your Sent messages…</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 max-w-6xl">

      {/* ── LEFT: Compose form ─────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Subject ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-300">Subject</label>
            <span className={`text-xs ${subject.length > 130 ? 'text-amber-400' : 'text-slate-500'}`}>
              {subject.length} / 150
            </span>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 150))}
            placeholder="Message subject…"
            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5
                       text-sm text-white placeholder-slate-500 focus:outline-none
                       focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
          />
        </div>

        {/* Priority ─────────────────────────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">Priority</label>
          <div className="flex gap-2">
            <button
              onClick={() => setPriority('NORMAL')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all
                ${priority === 'NORMAL'
                  ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'}`}
            >
              <ShieldCheck className="w-4 h-4" />
              Normal
            </button>
            <button
              onClick={() => setPriority('URGENT')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all
                ${priority === 'URGENT'
                  ? 'bg-red-600/25 border-red-500/60 text-red-300'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-red-700/50 hover:text-red-400'}`}
            >
              <AlertTriangle className="w-4 h-4" />
              Urgent
            </button>
          </div>
          {priority === 'URGENT' && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Urgent messages send an immediate email to all recipients regardless of their notification preferences.
            </p>
          )}
        </div>

        {/* Body ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-300">Message</label>
            <span className={`text-xs ${body.length > 1800 ? 'text-amber-400' : 'text-slate-500'}`}>
              {body.length} / 2000
            </span>
          </div>
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700 border-b-0 rounded-t-xl">
            <button
              onClick={() => insertFormat('**', '**')}
              title="Bold (Ctrl+B)"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertFormat('*', '*')}
              title="Italic (Ctrl+I)"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <Italic className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-700 mx-0.5" />
            <button
              onClick={insertBullet}
              title="Bullet list"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <List className="w-4 h-4" />
            </button>
            <span className="ml-auto text-[10px] text-slate-600">**bold** *italic* - bullet</span>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            placeholder="Write your message here…"
            rows={10}
            className="w-full bg-slate-800/60 border border-slate-700 rounded-b-xl px-4 py-3
                       text-sm text-white placeholder-slate-500 focus:outline-none
                       focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                       resize-y font-mono leading-relaxed"
          />
        </div>

        {/* Recipients ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-1 mb-4">
            <button
              onClick={() => setRecipientMode('specific')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                ${recipientMode === 'specific'
                  ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Users className="w-4 h-4" /> Specific Users
            </button>
            {/* Broadcast to a role group is Admin-only */}
            {isAdmin && (
              <button
                onClick={() => setRecipientMode('broadcast')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${recipientMode === 'broadcast'
                    ? 'bg-violet-600/30 border border-violet-500/50 text-violet-300'
                    : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Radio className="w-4 h-4" /> Broadcast to Role
              </button>
            )}
          </div>

          {recipientMode === 'specific' ? (
            <div ref={searchRef} className="relative">
              {/* Chips */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedUsers.map((u) => (
                    <span key={u.id}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full
                                 bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-200">
                      {displayName(u)}
                      <button
                        onClick={() => removeUser(u.id)}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-500/30"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => { setUserQuery(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by name or email…"
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                />
                {userSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
                )}
              </div>
              {/* Results dropdown */}
              {showDropdown && userResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  {userResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => addUser(u)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0">
                        {(displayName(u)).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{displayName(u)}</p>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                      <RoleBadge role={u.role} />
                    </button>
                  ))}
                </div>
              )}
              {userQuery.length >= 2 && !userSearching && userResults.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">No users found for "{userQuery}"</p>
              )}
              <p className="mt-2 text-xs text-slate-500">{recipientSummary}</p>
            </div>
          ) : (
            /* Broadcast mode */
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {BROADCAST_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBroadcastRole(opt.value)}
                    className={`flex flex-col items-start px-3 py-2 rounded-xl border text-sm transition-all
                      ${broadcastRole === opt.value
                        ? 'bg-violet-600/25 border-violet-500/50 text-violet-200'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[10px] opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
                {countLoading
                  ? <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                  : <Users className="w-4 h-4 text-slate-400" />
                }
                <span className="text-sm text-slate-300">{recipientSummary}</span>
                <button
                  onClick={() => fetchBroadcastCount(broadcastRole)}
                  className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"
                  title="Refresh count"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Attach Transfer ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-4">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => {
                setAttachEnabled((v) => !v)
                if (attachEnabled) { setSelectedTransfer(null); setTransferQuery('') }
              }}
              className={`w-10 h-5 rounded-full relative transition-colors
                ${attachEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${attachEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                <Paperclip className="inline w-3.5 h-3.5 mr-1.5 opacity-60" />
                Attach a file transfer
              </p>
              <p className="text-xs text-slate-500">Link an existing transfer so the recipient can download files directly.</p>
            </div>
          </label>

          {attachEnabled && (
            <div className="mt-3 relative">
              {selectedTransfer ? (
                /* Selected transfer card */
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-indigo-500/30">
                  <FileStack className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{selectedTransfer.subject}</p>
                    <p className="text-xs text-slate-400">
                      {selectedTransfer.totalFiles} file{selectedTransfer.totalFiles !== 1 ? 's' : ''} ·{' '}
                      To {displayName(selectedTransfer.recipient)} <TransferStatusPill status={selectedTransfer.status} />
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTransfer(null)}
                    className="text-slate-500 hover:text-white transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Transfer search */
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={transferQuery}
                      onChange={(e) => { setTransferQuery(e.target.value); setShowTransferDrop(true) }}
                      onFocus={() => setShowTransferDrop(true)}
                      placeholder="Search your sent transfers…"
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5
                                 text-sm text-white placeholder-slate-500 focus:outline-none
                                 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    {transferSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
                    )}
                  </div>
                  {showTransferDrop && transferResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                      {transferResults.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTransfer(t); setShowTransferDrop(false) }}
                          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-800 text-left transition-colors"
                        >
                          <FileStack className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{t.subject}</p>
                            <p className="text-xs text-slate-500">
                              {t.totalFiles} file{t.totalFiles !== 1 ? 's' : ''} · {displayName(t.recipient)}{' '}
                              <TransferStatusPill status={t.status} />
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error ─────────────────────────────────────────────────────── */}
        {sendError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {sendError}
          </div>
        )}

        {/* Draft notice */}
        <p className="text-xs text-slate-600 text-center">
          Drafts are saved locally.{' '}
          <button onClick={saveDraft} className="text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline">Save draft</button>
          {' · '}
          <button onClick={loadDraft} className="text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline">Load draft</button>
        </p>

        {/* Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSend}
            disabled={sending}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
              disabled:opacity-50 disabled:cursor-not-allowed
              ${priority === 'URGENT'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send Message</>}
          </button>
          <button
            onClick={saveDraft}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-700
                       text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
          >
            Save as Draft
          </button>
        </div>
      </div>

      {/* ── RIGHT: Live Preview ────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <div className="sticky top-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Live Preview</p>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
            {/* Preview header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-800/40">
              <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0">
                {senderName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-white truncate">{senderName}</p>
                  {priority === 'URGENT' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-600/30 border border-red-500/40 text-[10px] font-bold text-red-300 uppercase">
                      <AlertTriangle className="w-2.5 h-2.5" /> Urgent
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  <Clock className="inline w-2.5 h-2.5 mr-0.5" />
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · Admin → {recipientSummary}
                </p>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${priority === 'URGENT' ? 'bg-red-400' : 'bg-indigo-400'}`} />
            </div>

            {/* Subject */}
            <div className="px-4 pt-3 pb-2">
              <h3 className="text-sm font-bold text-white leading-snug">
                {subject || <span className="text-slate-600 font-normal italic">Subject will appear here…</span>}
              </h3>
            </div>

            {/* Body */}
            <div
              className="px-4 pb-4 text-xs text-slate-300 leading-relaxed max-h-64 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
            />

            {/* Transfer card */}
            {selectedTransfer && (
              <div className="mx-4 mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                <FileStack className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{selectedTransfer.subject}</p>
                  <p className="text-[10px] text-slate-500">
                    {selectedTransfer.totalFiles} file{selectedTransfer.totalFiles !== 1 ? 's' : ''} attached
                  </p>
                </div>
                <TransferStatusPill status={selectedTransfer.status} />
              </div>
            )}
          </div>

          {/* Preview legend */}
          <p className="mt-3 text-[10px] text-slate-600 text-center leading-relaxed">
            This is how your message will appear in the recipient&apos;s inbox.
            <br />Use **bold**, *italic*, or - bullets in the body.
          </p>
        </div>
      </div>

    </div>
  )
}
