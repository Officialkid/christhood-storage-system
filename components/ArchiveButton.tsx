'use client'

/**
 * ArchiveButton
 *
 * Admin-only toggle that archives or un-archives a single file.
 * After a successful API call it:
 *   1. Updates local state to reflect the new status
 *   2. Calls the optional `onDone` callback (e.g. router.refresh())
 *
 * Usage:
 *   <ArchiveButton fileId="..." currentStatus="PUBLISHED" onDone={() => router.refresh()} />
 */

import { useState }                from 'react'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'

interface Props {
  fileId:        string
  currentStatus: string
  /** Called after a successful archive / un-archive operation. */
  onDone?:       (newStatus: string) => void
  className?:    string
  /** If true shows a compact icon-only button. */
  compact?:      boolean
}

export function ArchiveButton({
  fileId,
  currentStatus,
  onDone,
  className = '',
  compact   = false,
}: Props) {
  const [status,  setStatus]  = useState(currentStatus)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const isArchived = status === 'ARCHIVED'
  const action     = isArchived ? 'unarchive' : 'archive'

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/archive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')

      const newStatus = data.status as string
      setStatus(newStatus)
      onDone?.(newStatus)
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const baseClass = compact
    ? 'p-1.5 rounded-lg transition-colors'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors'

  const colorClass = isArchived
    ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 border border-slate-600/50'

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        title={isArchived ? 'Un-archive this file' : 'Archive this file'}
        className={`${baseClass} ${colorClass} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : isArchived
            ? <ArchiveRestore className="w-3.5 h-3.5" />
            : <Archive className="w-3.5 h-3.5" />
        }
        {!compact && (
          <span>{isArchived ? 'Un-archive' : 'Archive'}</span>
        )}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
