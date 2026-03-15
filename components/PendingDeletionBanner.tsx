'use client'

import { useState } from 'react'
import { AlertOctagon, X, Loader2 } from 'lucide-react'

interface Props {
  pendingDeletionAt: string | null   // ISO string from server; null = no pending deletion
}

export default function PendingDeletionBanner({ pendingDeletionAt }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!pendingDeletionAt || dismissed) return null

  const scheduledAt  = new Date(new Date(pendingDeletionAt).getTime() + 24 * 60 * 60 * 1000)
  const hoursLeft    = Math.max(0, Math.ceil((scheduledAt.getTime() - Date.now()) / 3_600_000))

  async function handleCancel() {
    setCancelling(true); setError(null)
    try {
      const res  = await fetch('/api/user/cancel-deletion', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel')
      setDismissed(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="sticky top-0 z-50 bg-red-900/90 border-b border-red-500/40 backdrop-blur-sm px-4 py-2.5">
      <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
        <AlertOctagon className="w-4 h-4 text-red-300 shrink-0" />
        <p className="text-sm text-red-100 flex-1">
          <strong>Account deletion scheduled</strong> — your account will be permanently deleted in{' '}
          <strong>{hoursLeft}</strong> hour{hoursLeft !== 1 ? 's' : ''}.
          {error && <span className="ml-2 text-red-300">({error})</span>}
        </p>
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-700/60 hover:bg-red-700
                     border border-red-500/40 text-sm text-white transition-colors disabled:opacity-50"
        >
          {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Cancel deletion
        </button>
      </div>
    </div>
  )
}
