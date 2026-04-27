'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession }  from 'next-auth/react'
import {
  User, RefreshCw, CheckCircle, Loader2, Pencil, X, Check, ShieldCheck,
  CheckCircle2, XCircle, Download, Trash2, AlertTriangle, Archive,
  UserX, AlertOctagon, KeyRound, Eye, EyeOff, Copy, ShieldOff,
} from 'lucide-react'

// ─── Inline editable field ───────────────────────────────────────────────────
function EditableField({
  label, value, placeholder, maxLength, onSave,
}: {
  label: string; value: string; placeholder?: string
  maxLength: number; onSave: (val: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  function startEdit() { setDraft(value); setError(''); setEditing(true) }
  function cancel()    { setEditing(false); setError('') }

  async function save() {
    if (draft.trim() === value) { setEditing(false); return }
    setSaving(true); setError('')
    try {
      await onSave(draft.trim())
      setSaved(true); setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/60 gap-3 min-w-0">
      <dt className="text-sm text-slate-500 shrink-0 w-20">{label}</dt>
      {editing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5
                       text-sm text-white placeholder-slate-500 focus:outline-none
                       focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
          />
          <button onClick={save} disabled={saving}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Check className="w-3.5 h-3.5 text-white" />}
          </button>
          <button onClick={cancel}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition">
            <X className="w-3.5 h-3.5 text-slate-300" />
          </button>
          {error && <p className="text-xs text-red-400 shrink-0">{error}</p>}
        </div>
      ) : (
        <dd className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-sm font-medium truncate ${saved ? 'text-green-400' : 'text-white'}`}>
            {value || <span className="text-slate-500 italic font-normal">Not set</span>}
          </span>
          {saved && <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />}
          <button onClick={startEdit}
            className="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition shrink-0">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </dd>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Username field — editable with debounced availability check
// ─────────────────────────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/

function UsernameField({
  currentUsername,
  onSaved,
}: {
  currentUsername: string
  onSaved: (username: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(currentUsername)
  type Status = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'saving'
  const [status,    setStatus]    = useState<Status>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [error,     setError]     = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startEdit() {
    setDraft(currentUsername)
    setStatus('idle'); setStatusMsg(''); setError('')
    setEditing(true)
  }
  function cancel() { setEditing(false); setStatus('idle'); setError('') }

  useEffect(() => {
    if (!editing) return
    const val = draft.trim()
    if (val === currentUsername) { setStatus('idle'); setStatusMsg(''); return }
    if (!val) { setStatus('idle'); return }
    if (val.length < 3)         { setStatus('invalid'); setStatusMsg('Too short (min 3 characters)'); return }
    if (val.length > 20)        { setStatus('invalid'); setStatusMsg('Too long (max 20 characters)'); return }
    if (!USERNAME_RE.test(val)) { setStatus('invalid'); setStatusMsg('Letters, numbers, _ and – only'); return }

    setStatus('checking')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/user/username?q=${encodeURIComponent(val)}`)
        const data = await res.json()
        if (data.available) { setStatus('available'); setStatusMsg('Username available') }
        else                { setStatus('taken');     setStatusMsg(data.reason ?? 'Username taken') }
      } catch { setStatus('idle') }
    }, 500)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [draft, editing, currentUsername])

  async function save() {
    if (status !== 'available') return
    setStatus('saving'); setError('')
    try {
      const res  = await fetch('/api/user/username', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newUsername: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data.username)
      setEditing(false); setStatus('idle')
    } catch (e: any) { setError(e.message); setStatus('available') }
  }

  return (
    <div className="flex items-start justify-between py-3 border-b border-slate-800/60 gap-3 min-w-0">
      <dt className="text-sm text-slate-500 shrink-0 w-20 pt-1.5">Username</dt>
      {editing ? (
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={20}
              placeholder="3–20 chars · letters, numbers, _ –"
              onKeyDown={e => {
                if (e.key === 'Enter'  && status === 'available') save()
                if (e.key === 'Escape') cancel()
              }}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5
                         text-sm text-white placeholder-slate-500 focus:outline-none
                         focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
            />
            <button onClick={save} disabled={status !== 'available'}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed">
              {status === 'saving'
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <Check   className="w-3.5 h-3.5 text-white" />}
            </button>
            <button onClick={cancel} className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition">
              <X className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>
          {(status === 'checking' || status === 'available' || status === 'taken' || status === 'invalid') && (
            <div className={`flex items-center gap-1.5 text-xs ${
              status === 'available' ? 'text-emerald-400' : status === 'checking' ? 'text-slate-400' : 'text-red-400'
            }`}>
              {status === 'checking'  && <Loader2      className="w-3 h-3 animate-spin" />}
              {status === 'available' && <CheckCircle2 className="w-3 h-3" />}
              {(status === 'taken' || status === 'invalid') && <XCircle className="w-3 h-3" />}
              {statusMsg}
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <dd className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-sm font-medium text-white truncate font-mono">
            {currentUsername || <span className="text-slate-500 italic font-normal font-sans">Not set</span>}
          </span>
          <button onClick={startEdit}
            className="p-1 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition shrink-0">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </dd>
      )}
    </div>
  )
}

// ─── Two-Factor Authentication ────────────────────────────────────────────────
type TfaState = 'idle' | 'setup' | 'backup' | 'disable'

function TwoFactorSection() {
  /* local 2FA enabled state, fetched from the server on mount */
  const [enabled,   setEnabled]   = useState<boolean | null>(null)
  const [phase,     setPhase]     = useState<TfaState>('idle')

  /* setup wizard */
  const [qrUrl,     setQrUrl]     = useState('')
  const [secret,    setSecret]    = useState('')
  const [token,     setToken]     = useState('')
  const [backups,   setBackups]   = useState<string[]>([])
  const [copied,    setCopied]    = useState(false)

  /* disable form */
  const [disablePw,  setDisablePw]  = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [showDisPw,  setShowDisPw]  = useState(false)

  /* backup regenerate */
  const [regenToken, setRegenToken] = useState('')
  const [newBackups, setNewBackups] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  /* fetch current 2FA status */
  useEffect(() => {
    fetch('/api/user/2fa-status')
      .then(r => r.json())
      .then(d => setEnabled(!!d.twoFactorEnabled))
      .catch(() => setEnabled(false))
  }, [])

  function reset() {
    setPhase('idle'); setError(''); setToken(''); setQrUrl(''); setSecret('')
    setBackups([]); setDisablePw(''); setDisableCode(''); setRegenToken(''); setNewBackups([])
  }

  async function startSetup() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/2fa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Setup failed')
      setSecret(data.secret); setQrUrl(data.qrCodeUrl); setPhase('setup')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function enableTotp() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/2fa/enable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ secret, token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Enable failed')
      setBackups(data.backupCodes); setEnabled(true); setPhase('backup')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function disable2fa() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/2fa/disable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: disablePw, code: disableCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Disable failed')
      setEnabled(false); reset()
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function regenerateBackup() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/2fa/backup-codes/regenerate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: regenToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Regenerate failed')
      setNewBackups(data.backupCodes)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Two-Factor Authentication
        </h2>
        {enabled === true && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium
                           text-green-300 bg-green-600/15 border border-green-500/30
                           rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Enabled
          </span>
        )}
        {enabled === false && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium
                           text-slate-400 bg-slate-800/60 border border-slate-700/40
                           rounded-full px-2.5 py-0.5">
            Off
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30
                        rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* ── Idle: show enable / disable / regen options ─────────────────── */}
      {phase === 'idle' && enabled === false && (
        <div>
          <p className="text-sm text-slate-400 mb-4">
            Add an extra layer of security. You will need your authenticator app
            (Google Authenticator, Authy, etc.) each time you sign in.
          </p>
          <button
            onClick={startSetup}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Set up two-factor authentication
          </button>
        </div>
      )}

      {phase === 'idle' && enabled === true && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Your account is protected with TOTP-based two-factor authentication.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setPhase('backup'); setError('') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700
                         border border-slate-700/60 text-sm text-white transition"
            >
              <KeyRound className="w-4 h-4 text-indigo-400" />
              Regenerate backup codes
            </button>
            <button
              onClick={() => { setPhase('disable'); setError('') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/50
                         border border-red-500/30 text-sm text-red-300 transition"
            >
              <ShieldOff className="w-4 h-4" />
              Disable 2FA
            </button>
          </div>
        </div>
      )}

      {/* ── Setup wizard ────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            Scan this QR code with your authenticator app, then enter the 6-digit code below.
          </p>
          {qrUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR code" className="rounded-xl w-40 h-40 border border-slate-700" />
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 mb-1">
              Can't scan? Enter this code manually in your authenticator app:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-800 border border-slate-700 rounded-lg
                               px-3 py-2 text-indigo-300 break-all font-mono">
                {secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700
                           text-slate-400 hover:text-white transition"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              6-digit verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="000000"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                         px-4 py-3 text-sm text-white placeholder-slate-500 tracking-widest text-center
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={enableTotp}
              disabled={loading || token.length < 6}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Verify &amp; enable
            </button>
            <button onClick={reset}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Backup codes shown after enabling ──────────────────────────── */}
      {phase === 'backup' && backups.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 px-4 py-3">
            <p className="text-sm font-medium text-amber-300 mb-1">Save these backup codes!</p>
            <p className="text-xs text-amber-200/70">
              Each code can only be used once. Store them somewhere safe — they will not be shown again.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backups.map(c => (
              <code key={c} className="text-xs font-mono bg-slate-800 border border-slate-700
                                        rounded-lg px-3 py-2 text-white text-center">{c}</code>
            ))}
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       text-white text-sm font-medium transition"
          >
            <CheckCircle className="w-4 h-4" /> Done — I've saved my codes
          </button>
        </div>
      )}

      {/* ── Regenerate backup codes ─────────────────────────────────────── */}
      {phase === 'backup' && backups.length === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Enter your current authenticator code to generate 10 new backup codes.
            All existing backup codes will be invalidated.
          </p>
          {newBackups.length === 0 ? (
            <>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={regenToken}
                onChange={e => setRegenToken(e.target.value)}
                placeholder="6-digit code"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                           px-4 py-3 text-sm text-white placeholder-slate-500 tracking-widest text-center
                           focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={regenerateBackup}
                  disabled={loading || regenToken.length < 6}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                             disabled:opacity-50 text-white text-sm font-medium transition"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Generate new codes
                </button>
                <button onClick={reset}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 px-4 py-3">
                <p className="text-sm font-medium text-amber-300 mb-1">New backup codes</p>
                <p className="text-xs text-amber-200/70">Save these now — they won't be shown again.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {newBackups.map(c => (
                  <code key={c} className="text-xs font-mono bg-slate-800 border border-slate-700
                                            rounded-lg px-3 py-2 text-white text-center">{c}</code>
                ))}
              </div>
              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600
                           hover:bg-indigo-500 text-white text-sm font-medium transition"
              >
                <CheckCircle className="w-4 h-4" /> Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Disable 2FA ────────────────────────────────────────────────── */}
      {phase === 'disable' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Confirm your password and authenticator code (or a backup code) to disable 2FA.
          </p>
          <div className="relative">
            <input
              type={showDisPw ? 'text' : 'password'}
              value={disablePw}
              onChange={e => setDisablePw(e.target.value)}
              placeholder="Current password"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                         px-4 pr-11 py-3 text-sm text-white placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
            />
            <button
              type="button"
              onClick={() => setShowDisPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
            >
              {showDisPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <input
            type="text"
            value={disableCode}
            onChange={e => setDisableCode(e.target.value)}
            placeholder="6-digit code or backup code"
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                       px-4 py-3 text-sm text-white placeholder-slate-500 tracking-widest text-center
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={disable2fa}
              disabled={loading || !disablePw || !disableCode}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-700/90 hover:bg-red-700
                         disabled:opacity-50 text-white text-sm font-medium transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              Disable 2FA
            </button>
            <button onClick={reset}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { data: session, update } = useSession()

  const [restarting, setRestarting] = useState(false)
  const [restarted,  setRestarted]  = useState(false)
  const [tourError,  setTourError]  = useState<string | null>(null)

  const [name,     setName]     = useState<string>(session?.user?.name  ?? '')
  const [phone,    setPhone]    = useState<string>((session?.user as any)?.phone ?? '')
  const [username, setUsername] = useState<string>((session?.user as any)?.username ?? '')

  // ── Privacy / Zara logging opt-out ─────────────────────────────────────────
  const [zaraOptOut,    setZaraOptOut]    = useState(false)
  const [optOutLoading, setOptOutLoading] = useState(false)
  const [optOutFetched, setOptOutFetched] = useState(false)
  const [optOutError,   setOptOutError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/user/zara-logging-opt-out')
      .then(r => r.json())
      .then(d => { if (typeof d.optOut === 'boolean') setZaraOptOut(d.optOut) })
      .catch(() => {})
      .finally(() => setOptOutFetched(true))
  }, [])

  async function toggleZaraOptOut(newValue: boolean) {
    setOptOutLoading(true); setOptOutError(null)
    try {
      const res = await fetch('/api/user/zara-logging-opt-out', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ optOut: newValue }),
      })
      if (!res.ok) throw new Error('Failed to update preference')
      setZaraOptOut(newValue)
    } catch (e: any) {
      setOptOutError(e.message ?? 'Something went wrong')
    } finally {
      setOptOutLoading(false)
    }
  }

  // ── Account deletion flow ──────────────────────────────────────────────────
  // step: 0=idle, 1=choose file action, 2=confirm username, 3=scheduled/done
  const [deleteStep,    setDeleteStep]    = useState(0)
  const [deleteAction,  setDeleteAction]  = useState<'reassign' | 'archive' | 'trash'>('reassign')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError,   setDeleteError]   = useState<string | null>(null)
  const [scheduledAt,   setScheduledAt]   = useState<Date | null>(null)

  // Check whether a deletion is already pending
  useEffect(() => {
    fetch('/api/user/pending-deletion-status')
      .then(r => r.json())
      .then(d => {
        if (d?.pendingDeletionAt) {
          const t = new Date(d.pendingDeletionAt)
          setScheduledAt(new Date(t.getTime() + 24 * 60 * 60 * 1000))
          setDeleteStep(3)
        }
      })
      .catch(() => {})
  }, [])

  async function submitDeletion() {
    setDeleteLoading(true); setDeleteError(null)
    const matchTarget = username || (session?.user?.email ?? '')
    if (deleteConfirm !== matchTarget) {
      setDeleteError('The text you entered does not match your username.')
      setDeleteLoading(false)
      return
    }
    try {
      const res  = await fetch('/api/user/delete-account', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: deleteAction, confirmUsername: deleteConfirm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setScheduledAt(new Date(data.scheduledAt))
      setDeleteStep(3)
    } catch (e: any) { setDeleteError(e.message) }
    finally { setDeleteLoading(false) }
  }

  async function cancelDeletion() {
    setDeleteLoading(true); setDeleteError(null)
    try {
      const res  = await fetch('/api/user/cancel-deletion', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel')
      setDeleteStep(0); setScheduledAt(null); setDeleteConfirm('')
    } catch (e: any) { setDeleteError(e.message) }
    finally { setDeleteLoading(false) }
  }

  // ── Export data ────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)
  async function downloadMyData() {
    setExporting(true)
    try {
      const res  = await fetch('/api/user/export-my-data')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url; a.download = 'christhood-my-data.json'; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    finally { setExporting(false) }
  }

  // Sync if session loads after mount
  if (session?.user?.name && !name)                       setName(session.user.name)
  if ((session?.user as any)?.phone    && !phone)         setPhone((session?.user as any).phone)
  if ((session?.user as any)?.username && !username)      setUsername((session?.user as any).username)

  async function saveField(field: 'name' | 'phone', value: string) {
    const res = await fetch('/api/user/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [field]: value }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Failed to save')
    }
    if (field === 'name')  { setName(value);  await update({ name: value }) }
    if (field === 'phone') { setPhone(value) }
  }

  async function handleUsernameSaved(newUsername: string) {
    setUsername(newUsername)
    // Trigger JWT re-read from DB so the updated username propagates to all session.user references
    await update()
  }

  async function handleRestartTour() {
    setRestarting(true); setTourError(null)
    try {
      const res = await fetch('/api/user/onboarding', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reset: true }),
      })
      if (!res.ok) throw new Error('Failed to reset tour')
      setRestarted(true)
      setTimeout(() => setRestarted(false), 3000)
      window.dispatchEvent(new Event('restart-tour'))
    } catch (err: any) {
      setTourError(err.message ?? 'Something went wrong')
    } finally {
      setRestarting(false)
    }
  }

  const user         = session?.user
  const matchTarget  = username || (user?.email ?? '')

  function hoursUntil(d: Date): number {
    return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 3_600_000))
  }

  return (
    <div className="max-w-lg space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm text-slate-400 mt-0.5">View and edit your account information</p>
        </div>
      </div>

      {/* ── Account details ───────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Account</h2>
        <dl>
          {/* Username — always shown, editable with live availability check */}
          <UsernameField currentUsername={username} onSaved={handleUsernameSaved} />

          <div className="flex items-center justify-between py-3 border-b border-slate-800/60">
            <dt className="text-sm text-slate-500 w-20">Email</dt>
            <dd className="text-sm text-white font-medium">{user?.email}</dd>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-800/60">
            <dt className="text-sm text-slate-500 w-20">Role</dt>
            <dd>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                               bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                {(user as any)?.role ?? 'UPLOADER'}
              </span>
            </dd>
          </div>
          <EditableField label="Name"  value={name}  placeholder="Your display name" maxLength={80} onSave={v => saveField('name',  v)} />
          <EditableField label="Phone" value={phone} placeholder="+1 555 000 0000"   maxLength={30} onSave={v => saveField('phone', v)} />
        </dl>
      </div>

      {/* ── Onboarding tour ───────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Onboarding Tour</h2>
        <p className="text-sm text-slate-400 mb-4">Replay the guided tour to revisit key features of the CMMS.</p>
        {tourError && <p className="text-sm text-red-400 mb-3">{tourError}</p>}
        <button
          onClick={handleRestartTour}
          disabled={restarting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700
                     border border-slate-700/60 text-sm text-white transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {restarting ? <Loader2 className="w-4 h-4 animate-spin" /> :
           restarted  ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                        <RefreshCw  className="w-4 h-4 text-indigo-400" />}
          {restarted ? 'Tour restarted!' : 'Restart Onboarding Tour'}
        </button>
      </div>

      {/* ── Two-Factor Authentication ─────────────────────────────────── */}
      <TwoFactorSection />

      {/* ── Your Data & Privacy ───────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Your Data &amp; Privacy</h2>
        </div>

        {/* ── Download data ─────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-white mb-1">Download your data</p>
          <p className="text-xs text-slate-400 mb-3">
            Export a copy of your uploads, activity log, and preferences as a JSON file.
          </p>
          <button
            onClick={downloadMyData}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700
                       border border-slate-700/60 text-sm text-white transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-indigo-400" />}
            {exporting ? 'Preparing download…' : 'Download my data'}
          </button>
        </div>

        {/* ── Zara opt-out ────────────────────────────────────────────────── */}
        <div className="pt-4 border-t border-slate-800/60">
          <p className="text-xs text-slate-400 mb-4">
            Zara may save anonymised conversation summaries to help improve the assistant over time.
            Opting out stops new logs from being created and immediately deletes any existing logs for
            your account.
          </p>
          {optOutError && <p className="text-sm text-red-400 mb-3">{optOutError}</p>}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Opt out of conversation logging</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {zaraOptOut ? 'Logging is currently disabled for your account.' : 'Anonymised logs are currently being saved.'}
              </p>
            </div>
            <button
              onClick={() => toggleZaraOptOut(!zaraOptOut)}
              disabled={optOutLoading || !optOutFetched}
              aria-pressed={zaraOptOut}
              className={[
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50',
                zaraOptOut ? 'bg-indigo-600' : 'bg-slate-700',
              ].join(' ')}
            >
              <span className={[
                'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                zaraOptOut ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')} />
            </button>
          </div>
        </div>

        {/* ── Delete my account ─────────────────────────────────────────── */}
        <div className="pt-4 border-t border-red-500/20">
          <div className="flex items-center gap-2 mb-1">
            <UserX className="w-4 h-4 text-red-400" />
            <p className="text-sm font-semibold text-red-300">Delete my account</p>
          </div>

          {/* Step 3 — already scheduled */}
          {deleteStep === 3 && scheduledAt && (
            <div className="mt-3 rounded-xl bg-red-950/30 border border-red-500/30 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-200">
                  Your account is scheduled for deletion in{' '}
                  <strong>{hoursUntil(scheduledAt)}</strong>{' '}
                  hour{hoursUntil(scheduledAt) !== 1 ? 's' : ''}.
                  A confirmation email has been sent to your address.
                </p>
              </div>
              {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
              <button
                onClick={cancelDeletion}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700
                           border border-slate-600 text-sm text-white transition disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Cancel deletion
              </button>
            </div>
          )}

          {/* Step 0 — idle entry point */}
          {deleteStep === 0 && (
            <>
              <p className="text-xs text-slate-400 mb-3">
                Permanently removes your account. Your activity log will be anonymised.
                Messages and notifications will be deleted.
              </p>
              <button
                onClick={() => setDeleteStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                           bg-red-950/40 hover:bg-red-900/50 border border-red-500/40
                           text-sm text-red-300 font-medium transition"
              >
                <Trash2 className="w-4 h-4" />
                Delete my account
              </button>
            </>
          )}

          {/* Step 1 — choose file handling */}
          {deleteStep === 1 && (
            <div className="mt-3 rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 space-y-4">
              <p className="text-sm font-medium text-white">What should happen to your uploaded files?</p>
              <div className="space-y-2">
                {([
                  { value: 'reassign' as const, icon: <User    className="w-4 h-4 text-indigo-400" />, label: 'Keep my files',    desc: 'Reassign them to the admin — they stay in the system.' },
                  { value: 'archive'  as const, icon: <Archive className="w-4 h-4 text-amber-400"  />, label: 'Archive my files', desc: 'Mark them all as Archived — still accessible to admins.' },
                  { value: 'trash'    as const, icon: <Trash2  className="w-4 h-4 text-red-400"    />, label: 'Delete my files',  desc: 'Move them all to Trash (purged after 30 days).' },
                ] as const).map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition
                                ${deleteAction === opt.value
                                  ? 'bg-indigo-600/15 border-indigo-500/50'
                                  : 'bg-slate-900/50 border-slate-700/40 hover:border-slate-600/60'}`}
                  >
                    <input
                      type="radio" name="deleteAction" value={opt.value}
                      checked={deleteAction === opt.value}
                      onChange={() => setDeleteAction(opt.value)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {opt.icon}
                        <span className="text-sm font-medium text-white">{opt.label}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Your activity log entries will be anonymised but not deleted (needed for system
                integrity). Your messages and notifications will be permanently deleted.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => setDeleteStep(2)}
                  className="px-4 py-2 rounded-xl bg-red-700/80 hover:bg-red-700 text-white text-sm font-medium transition">
                  Continue
                </button>
                <button onClick={() => setDeleteStep(0)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — confirm username */}
          {deleteStep === 2 && (
            <div className="mt-3 rounded-xl bg-slate-800/50 border border-red-500/30 p-4 space-y-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-300">
                  This action is <strong className="text-red-300">irreversible</strong>. Type your username{' '}
                  <span className="font-mono text-white bg-slate-700 px-1.5 py-0.5 rounded text-xs">{matchTarget}</span>{' '}
                  to confirm.
                </p>
              </div>
              <input
                value={deleteConfirm}
                onChange={e => { setDeleteConfirm(e.target.value); setDeleteError(null) }}
                placeholder={`Type "${matchTarget}" to confirm`}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-slate-600 focus:outline-none focus:border-red-500/60 focus:ring-1
                           focus:ring-red-500/30 transition"
              />
              {deleteError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />{deleteError}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={submitDeletion}
                  disabled={deleteLoading || deleteConfirm !== matchTarget}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl
                             bg-red-700/90 hover:bg-red-700 text-white text-sm font-medium transition
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                  Delete my account
                </button>
                <button
                  onClick={() => { setDeleteStep(0); setDeleteConfirm(''); setDeleteError(null) }}
                  disabled={deleteLoading}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
