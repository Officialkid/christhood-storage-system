'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, Phone, Lock, Eye, EyeOff, UserPlus, Loader2, Hourglass } from 'lucide-react'

function PasswordStrengthBar({ password }: { password: string }) {
  const len    = password.length
  const hasUpper  = /[A-Z]/.test(password)
  const hasLower  = /[a-z]/.test(password)
  const hasNum    = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const score = [len >= 8, hasUpper, hasLower, hasNum, hasSymbol].filter(Boolean).length

  const label  = ['', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score]
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500']
  const color  = colors[score] ?? 'bg-slate-700'

  if (!password) return null

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300
                        ${i <= score ? color : 'bg-slate-700'}`}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

export default function SignupPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    username: '', email: '', phone: '', password: '', confirm: '',
  })
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [pending,     setPending]     = useState(false)

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username: form.username,
        email:    form.email,
        phone:    form.phone || undefined,
        password: form.password,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Registration failed.')
      return
    }

    // Account created but pending admin approval — show waiting screen
    setPending(true)
  }

  async function handleGoogle() {
    await signIn('google', { callbackUrl: '/dashboard' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020817] px-4 relative overflow-hidden">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[500px] h-[500px]
                      rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[500px] h-[500px]
                      rounded-full bg-indigo-600/20 blur-[120px]" />

      {/* ── Pending approval screen ── */}
      {pending && (
        <div className="relative z-10 w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30
                          flex items-center justify-center">
            <Hourglass className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Account submitted!</h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
              Your account is <strong className="text-white">pending admin approval</strong>.
              An admin will review your request and assign your role — you&apos;ll receive an
              email at <strong className="text-white">{form.email}</strong> once approved.
            </p>
          </div>
          <Link href="/login"
            className="inline-block text-sm text-indigo-400 hover:text-indigo-300 transition underline">
            Back to sign in
          </Link>
        </div>
      )}

      {!pending && <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                        rounded-2xl shadow-2xl shadow-black/40 px-8 py-10">

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              Create an account
            </h1>
            <p className="text-sm text-slate-400">Join Christhood CMMS</p>
          </div>

          {error && (
            <div className="mb-5 text-sm text-red-400 bg-red-500/10 border
                            border-red-500/30 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={form.username}
                  onChange={update('username')}
                  required
                  placeholder="john_doe"
                  pattern="[a-zA-Z0-9_]{3,30}"
                  title="3–30 characters: letters, numbers, underscores"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                             pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  required
                  placeholder="john@example.com"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                             pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                />
              </div>
            </div>

            {/* Phone (optional) */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Phone <span className="text-slate-600">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="+1 555 000 0000"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                             pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
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
              <PasswordStrengthBar password={form.password} />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={update('confirm')}
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                             pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.confirm && form.password !== form.confirm && (
                <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 mt-2
                         bg-gradient-to-r from-indigo-600 to-violet-600
                         hover:from-indigo-500 hover:to-violet-500
                         disabled:opacity-60 disabled:cursor-not-allowed
                         text-white text-sm font-semibold rounded-xl
                         py-3 transition-all duration-200 shadow-lg shadow-indigo-500/20"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <UserPlus className="w-4 h-4" />
              }
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-5 gap-3">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3
                       bg-white hover:bg-slate-100 text-slate-900
                       text-sm font-medium rounded-xl py-3 transition shadow"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign up with Google
          </button>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>}
    </div>
  )
}
