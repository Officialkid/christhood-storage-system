'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  fileId:    string
  fileName:  string
  /** Called after a successful soft-delete so the parent can refresh/remove the item */
  onDeleted?: (fileId: string) => void
  /** Visual variant */
  variant?: 'icon' | 'button'
}

/**
 * Admin-only soft-delete trigger.
 * Calls POST /api/admin/media/[fileId]/delete and invokes onDeleted callback.
 *
 * Render this only when session.user.role === 'ADMIN'.
 */
export function DeleteButton({ fileId, fileName, onDeleted, variant = 'button' }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`Move "${fileName}" to Trash?\n\nThe file can be restored within 30 days.`)) return

    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/media/${fileId}/delete`, { method: 'POST' })
      const body = await res.json()

      if (!res.ok) {
        alert(`Delete failed: ${body.error ?? 'Unknown error'}`)
        return
      }

      onDeleted?.(fileId)
    } catch {
      alert('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleDelete}
        disabled={loading}
        title="Move to Trash"
        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10
                   transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Trash2  className="w-4 h-4" />
        }
      </button>
    )
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium
                 bg-red-600/15 text-red-400 border border-red-600/25
                 hover:bg-red-600/30 hover:border-red-600/40 transition
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Trash2  className="w-3.5 h-3.5" />
      }
      {loading ? 'Deleting…' : 'Delete'}
    </button>
  )
}
