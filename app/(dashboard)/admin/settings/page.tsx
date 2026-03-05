'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession }  from 'next-auth/react'
import { useRouter }   from 'next/navigation'
import {
  Settings, Archive, Save, Check, Loader2, AlertTriangle, Info,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface AppSettings {
  archive_threshold_months: string
  [key: string]: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [settings,  setSettings]  = useState<AppSettings | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Local form state
  const [thresholdMonths, setThresholdMonths] = useState('6')

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session?.user || session.user.role !== 'ADMIN') {
      router.replace('/dashboard')
    }
  }, [authStatus, session, router])

  // ── Load settings ───────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load settings')
      const s = data.settings as AppSettings
      setSettings(s)
      setThresholdMonths(s.archive_threshold_months ?? '6')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const months = parseInt(thresholdMonths)
    if (isNaN(months) || months < 1 || months > 120) {
      setError('Threshold must be between 1 and 120 months.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ archive_threshold_months: String(months) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')

      setSettings(data.settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Guard: non-admin while loading ──────────────────────────────────────
  if (authStatus === 'loading' || !session?.user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700
                        flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">System Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Global configuration for the Christhood CMMS</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/30
                        px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading settings…</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Archive threshold ─────────────────────────────────────────── */}
          <section className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Archive className="w-5 h-5 text-amber-500/70 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-white">Archive Automation</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Controls when the daily archive job auto-archives old files
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                Archive threshold (months)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={thresholdMonths}
                  onChange={e => setThresholdMonths(e.target.value)}
                  className="w-28 bg-slate-800/60 border border-slate-700/50 rounded-xl
                             px-4 py-2.5 text-sm text-white
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                             focus:border-transparent transition
                             [appearance:textfield]
                             [&::-webkit-outer-spin-button]:appearance-none
                             [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-slate-400">months after upload date</span>
              </div>

              <div className="flex items-start gap-2 mt-3 rounded-lg bg-slate-800/40
                              border border-slate-700/30 px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Files with status <strong className="text-slate-400">PUBLISHED</strong> or{' '}
                  <strong className="text-slate-400">EDITED</strong> that are older than this
                  threshold are automatically archived daily.
                  Current setting: files older than{' '}
                  <strong className="text-slate-400">
                    {settings?.archive_threshold_months ?? thresholdMonths} month
                    {(settings?.archive_threshold_months ?? thresholdMonths) !== '1' ? 's' : ''}
                  </strong>{' '}
                  are eligible.
                </p>
              </div>
            </div>
          </section>

          {/* ── Save button ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-gradient-to-r from-indigo-600 to-violet-600
                         hover:from-indigo-500 hover:to-violet-500
                         disabled:opacity-60 disabled:cursor-not-allowed
                         text-white text-sm font-semibold transition-all shadow-lg
                         shadow-indigo-500/20"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />
              }
              {saving ? 'Saving…' : 'Save settings'}
            </button>

            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <Check className="w-4 h-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
