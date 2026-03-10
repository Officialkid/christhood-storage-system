'use client'

import { useState }        from 'react'
import { useSession }      from 'next-auth/react'
import { User, RefreshCw, CheckCircle, Loader2, Pencil, X, Check } from 'lucide-react'

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

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { data: session, update } = useSession()

  const [restarting, setRestarting] = useState(false)
  const [restarted,  setRestarted]  = useState(false)
  const [tourError,  setTourError]  = useState<string | null>(null)

  const [name,  setName]  = useState<string>(session?.user?.name  ?? '')
  const [phone, setPhone] = useState<string>((session?.user as any)?.phone ?? '')

  // Sync if session loads after mount
  if (session?.user?.name  && !name)  setName(session.user.name)
  if ((session?.user as any)?.phone && !phone) setPhone((session?.user as any).phone)

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

  const user = session?.user

  return (
    <div className="max-w-lg space-y-8">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm text-slate-400 mt-0.5">View and edit your account information</p>
        </div>
      </div>

      {/* ── Account details ───────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Account</h2>
        <dl>
          {(user as any)?.username && (
            <div className="flex items-center justify-between py-3 border-b border-slate-800/60">
              <dt className="text-sm text-slate-500 w-20">Username</dt>
              <dd className="text-sm text-white font-medium">{(user as any).username}</dd>
            </div>
          )}
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

      {/* ── Onboarding tour ───────────────────────────────────────────── */}
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

    </div>
  )
}
