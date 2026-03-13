'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2, Trash2, X } from 'lucide-react'

type Role = 'ADMIN' | 'UPLOADER' | 'EDITOR'

interface User {
  id:           string
  username:     string | null
  name:         string | null
  email:        string
  role:         Role
  isActive:     boolean
  deactivatedAt: string | null
}

type FileAction = 'reassign' | 'archive' | 'trash'

interface Props {
  user:       User
  adminUsers: User[]   // other admin accounts to reassign files to
  onClose:    () => void
  onDeleted:  () => void
}

export default function UserDeleteDialog({ user, adminUsers, onClose, onDeleted }: Props) {
  const isTestUser =
    user.email.toLowerCase().includes('test') ||
    (user.username?.toLowerCase().includes('test') ?? false)

  // For test users start at step 2 (confirm), for real users start at step 1 (file fate)
  const initialStep = isTestUser ? 2 : 1
  const [step,         setStep]         = useState<1 | 2>(initialStep)
  const [fileCount,    setFileCount]    = useState<number | null>(null)
  const [action,       setAction]       = useState<FileAction>('reassign')
  const [reassignToId, setReassignToId] = useState(adminUsers[0]?.id ?? '')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Load file count when dialog opens
  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/delete`)
      .then(r => r.json())
      .then(d => setFileCount(d.fileCount ?? 0))
      .catch(() => setFileCount(0))
  }, [user.id])

  const displayName = user.username ?? user.name ?? user.email

  async function handleDelete() {
    setLoading(true)
    setError('')

    const body: { action: FileAction; reassignToId?: string } =
      isTestUser
        ? { action: 'trash' }
        : action === 'reassign'
          ? { action, reassignToId }
          : { action }

    try {
      const res  = await fetch(`/api/admin/users/${user.id}/delete`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setLoading(false); return }
      onDeleted()
      onClose()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const btnBase = `w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                   text-sm font-semibold transition disabled:opacity-60`
  const selectCls = `w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                     px-4 py-2.5 text-sm text-white appearance-none
                     focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800
                      rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <Trash2 className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Delete Account</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">
                {displayName}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
                  className="text-slate-500 hover:text-slate-300 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30
                            rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* ── STEP 1: Choose what to do with files ─────────────────── */}
          {step === 1 && (
            <>
              {/* File count summary */}
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
                {fileCount === null ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading file info…
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-white">{displayName}</span>
                    {' '}has uploaded{' '}
                    <span className="font-semibold text-white">{fileCount}</span>
                    {' '}{fileCount === 1 ? 'file' : 'files'}
                    {' '}that need to be handled before their account can be removed.
                  </p>
                )}
              </div>

              {/* Action choice */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  What should happen to their files?
                </p>

                {([ 
                  { v: 'reassign', label: 'Reassign to another user',    desc: 'Files stay active, ownership changes' },
                  { v: 'archive',  label: 'Archive all files',           desc: 'Files stay but are marked as Archived' },
                  { v: 'trash',    label: 'Move all files to Trash',     desc: 'Files will be purged in 30 days' },
                ] as { v: FileAction; label: string; desc: string }[]).map(opt => (
                  <label key={opt.v}
                         className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition
                           ${action === opt.v
                               ? 'border-indigo-500/60 bg-indigo-500/10'
                               : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600/60'}`}
                  >
                    <input type="radio" name="fileAction" value={opt.v}
                           checked={action === opt.v}
                           onChange={() => setAction(opt.v)}
                           className="mt-0.5 accent-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-white">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Reassign target selector */}
              {action === 'reassign' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-400">
                    Reassign files to
                  </label>
                  <div className="relative">
                    <select value={reassignToId} onChange={e => setReassignToId(e.target.value)}
                            className={selectCls}>
                      {adminUsers.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.username ?? a.email} ({a.role})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2
                                            w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={onClose}
                        className={`${btnBase} text-slate-400 border border-slate-700 hover:bg-slate-800`}>
                  Cancel
                </button>
                <button
                  disabled={action === 'reassign' && !reassignToId}
                  onClick={() => setStep(2)}
                  className={`${btnBase} text-white
                    bg-gradient-to-r from-indigo-600 to-violet-600
                    hover:from-indigo-500 hover:to-violet-500`}
                >
                  Next: Confirm Deletion
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: Final confirmation ────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="flex gap-3 bg-red-500/5 border border-red-500/30
                              rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    This action is permanent and cannot be undone.
                  </p>
                  <ul className="text-xs text-slate-400 space-y-0.5 list-disc list-inside">
                    <li>
                      Account for <span className="text-white font-medium">{displayName}</span> will be deleted
                    </li>
                    {isTestUser ? (
                      <li>All uploaded files will be moved to Trash (purged in 30 days)</li>
                    ) : action === 'reassign' ? (
                      <li>Files will be reassigned to {adminUsers.find(a => a.id === reassignToId)?.username ?? 'selected user'}</li>
                    ) : action === 'archive' ? (
                      <li>All files will be archived</li>
                    ) : (
                      <li>All files will be moved to Trash (purged in 30 days)</li>
                    )}
                    <li>Activity log entries will be retained anonymously</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                {!isTestUser && (
                  <button onClick={() => setStep(1)} disabled={loading}
                          className={`${btnBase} text-slate-400 border border-slate-700 hover:bg-slate-800`}>
                    Back
                  </button>
                )}
                {isTestUser && (
                  <button onClick={onClose} disabled={loading}
                          className={`${btnBase} text-slate-400 border border-slate-700 hover:bg-slate-800`}>
                    Cancel
                  </button>
                )}
                <button onClick={handleDelete} disabled={loading}
                        className={`${btnBase} text-white bg-red-600 hover:bg-red-500`}>
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                    : <><Trash2 className="w-4 h-4" />Delete Account</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
