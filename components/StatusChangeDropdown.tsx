'use client'

/**
 * StatusChangeDropdown
 * Renders a small "Change status" button with a pop-up option list.
 * Only shown to EDITOR and ADMIN — invisible to UPLOADER.
 *
 * After a successful update the component calls `onChanged(newStatus)`.
 * The parent is responsible for refreshing / updating local state.
 */

import { useState, useRef, useEffect } from 'react'
import type { AppRole } from '@/types'

// ─── Status display metadata ──────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  RAW:                 'Raw',
  EDITING_IN_PROGRESS: 'Editing',
  EDITED:              'Edited',
  PUBLISHED:           'Published',
  ARCHIVED:            'Archived',
}

/** Statuses an EDITOR is allowed to set */
const EDITOR_STATUSES = ['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED'] as const

/** Statuses an ADMIN is allowed to set (superset of editor's) */
const ADMIN_STATUSES  = ['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED'] as const

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  fileId:        string
  currentStatus: string
  userRole:      AppRole
  /** Called with the new status string once the API confirms the change */
  onChanged?:    (newStatus: string) => void
  className?:    string
}

export function StatusChangeDropdown({
  fileId,
  currentStatus,
  userRole,
  onChanged,
  className = '',
}: Props) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const wrapperRef            = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // UPLOADER has no permission — render nothing
  if (userRole === 'UPLOADER') return null

  const allowed =
    userRole === 'ADMIN'
      ? (ADMIN_STATUSES as readonly string[])
      : (EDITOR_STATUSES as readonly string[])

  const options = allowed.filter((s) => s !== currentStatus)

  async function handleSelect(newStatus: string) {
    setOpen(false)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/media/${fileId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newStatus }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Update failed')
      } else {
        onChanged?.(newStatus)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={loading}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="mt-1 w-full rounded-md bg-slate-700 px-2 py-1 text-xs
                   text-slate-300 transition-colors hover:bg-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving…' : 'Change status ▾'}
      </button>

      {error && (
        <p className="mt-0.5 text-[10px] text-red-400 leading-tight">{error}</p>
      )}

      {/* Dropdown list — opens upward to avoid clipping at card bottom */}
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 z-30
                     rounded-lg border border-slate-700 bg-slate-900 shadow-2xl
                     overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className="px-3 py-2 text-left text-sm text-slate-200
                         hover:bg-slate-700 transition-colors"
            >
              {LABELS[s] ?? s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
