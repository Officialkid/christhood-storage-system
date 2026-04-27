'use client'

import { useState, Suspense, useRef, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, KeyRound, Loader2, Mail } from 'lucide-react'

function TwoFactorInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get('callbackUrl') ?? '/dashboard'

  const [code,      setCode]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState('')
  const [notice,    setNotice]    = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    sendCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendCode() {
    setSending(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/auth/2fa/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'challenge' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send verification code.')
      setNotice('Verification code sent to your Gmail inbox.')
    } catch (e: any) {
      setError(e.message ?? 'Could not send verification code.')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError('')

    try {
      const res  = await fetch('/api/auth/2fa/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Verification failed. Try again.')
        setLoading(false)
        return
      }

      // Verification succeeded — the cookie has been set by the server.
      router.replace(callbackUrl)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020817] px-4 relative overflow-hidden">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px]
                      rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px]
                      rounded-full bg-violet-600/20 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                        rounded-2xl shadow-2xl shadow-black/40 px-8 py-10">

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full
                            bg-indigo-500/10 border border-indigo-500/30 mb-4">
              <ShieldCheck className="w-7 h-7 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              Two-factor verification
            </h1>
            <p className="text-sm text-slate-400">
              We sent a 6-digit verification code to your Gmail. Enter it below to continue.
            </p>
          </div>

          {notice && (
            <div className="mb-5 text-sm border rounded-lg px-4 py-3 flex items-start gap-2 text-emerald-300 bg-emerald-500/10 border-emerald-500/30">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="mb-5 text-sm border rounded-lg px-4 py-3 flex items-start gap-2
                            text-red-400 bg-red-500/10 border-red-500/30">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                6-digit code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2
                                     w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                             pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                             focus:border-transparent tracking-widest text-center transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600
                         hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-medium py-3 rounded-xl transition text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition
                         flex items-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              {sending ? 'Sending code…' : 'Resend code to Gmail'}
            </button>

            {/* Sign out */}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Sign out and use a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorInner />
    </Suspense>
  )
}
