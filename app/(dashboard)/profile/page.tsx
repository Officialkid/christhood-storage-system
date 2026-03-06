'use client'

import { useState }        from 'react'
import { useSession }      from 'next-auth/react'
import { User, RefreshCw, CheckCircle, Loader2 } from 'lucide-react'

export default function ProfilePage() {
  const { data: session } = useSession()

  const [restarting, setRestarting] = useState(false)
  const [restarted,  setRestarted]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleRestartTour() {
    setRestarting(true)
    setError(null)
    try {
      const res = await fetch('/api/user/onboarding', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reset: true }),
      })
      if (!res.ok) throw new Error('Failed to reset tour')
      setRestarted(true)
      setTimeout(() => setRestarted(false), 3000)
      // Trigger the OnboardingTour component (mounted in layout) to restart
      window.dispatchEvent(new Event('restart-tour'))
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setRestarting(false)
    }
  }

  const user = session?.user

  return (
    <div className="max-w-lg space-y-8">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your account information</p>
        </div>
      </div>

      {/* ── Account details ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Account</h2>

        <dl className="space-y-3">
          {user?.username && (
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <dt className="text-sm text-slate-500">Username</dt>
              <dd className="text-sm text-white font-medium">{user.username}</dd>
            </div>
          )}
          {user?.name && (
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <dt className="text-sm text-slate-500">Name</dt>
              <dd className="text-sm text-white font-medium">{user.name}</dd>
            </div>
          )}
          {user?.email && (
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="text-sm text-white font-medium">{user.email}</dd>
            </div>
          )}
          {user?.role && (
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-slate-500">Role</dt>
              <dd>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                  {user.role}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Onboarding tour ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Onboarding Tour</h2>
        <p className="text-sm text-slate-400 mb-4">
          Replay the guided tour to revisit key features of the CMMS.
        </p>

        {error && (
          <p className="text-sm text-red-400 mb-3">{error}</p>
        )}

        <button
          onClick={handleRestartTour}
          disabled={restarting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {restarting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : restarted ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <RefreshCw className="w-4 h-4 text-indigo-400" />
          )}
          {restarted ? 'Tour restarted!' : 'Restart Onboarding Tour'}
        </button>
      </div>

    </div>
  )
}
