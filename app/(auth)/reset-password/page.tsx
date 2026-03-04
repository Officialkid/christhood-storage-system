'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, KeyRound, Loader2, CheckCircle } from 'lucide-react'

function ResetForm() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''
  const router       = useRouter()

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) { setError('Reset token is missing. Please request a new link.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }

    setLoading(true)

    const res  = await fetch('/api/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, password }),
    })
    const data = await res.json()

    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
    } else {
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Password updated!</h2>
        <p className="text-sm text-slate-400 mb-1">
          Your password has been changed successfully.
        </p>
        <p className="text-sm text-slate-500">Redirecting to sign in…</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Reset password
        </h1>
        <p className="text-sm text-slate-400">Enter your new password below.</p>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-400 bg-red-500/10 border
                        border-red-500/30 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                         pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm New Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type={showConf ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                         pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
            />
            <button type="button" onClick={() => setShowConf(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
              {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirm && password !== confirm && (
            <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2
                     bg-gradient-to-r from-indigo-600 to-violet-600
                     hover:from-indigo-500 hover:to-violet-500
                     disabled:opacity-60 disabled:cursor-not-allowed
                     text-white text-sm font-semibold rounded-xl
                     py-3 transition-all duration-200 shadow-lg shadow-indigo-500/20"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <KeyRound className="w-4 h-4" />
          }
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Remember it?{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition">
          Sign in
        </Link>
      </p>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020817] px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px]
                      rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px]
                      rounded-full bg-violet-600/20 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                        rounded-2xl shadow-2xl shadow-black/40 px-8 py-10">
          <Suspense fallback={<div className="text-slate-400 text-center">Loading…</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
