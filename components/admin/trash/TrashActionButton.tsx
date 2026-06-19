'use client'

import type React from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  idleLabel: string
  busyLabel: string
  icon: React.ReactNode
  tone: 'success' | 'danger'
}

export function TrashActionButton({
  onClick,
  disabled = false,
  busy = false,
  idleLabel,
  busyLabel,
  icon,
  tone,
}: Props) {
  const toneClasses = tone === 'success'
    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-600/30 hover:bg-emerald-600/40'
    : 'bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/40'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed ${toneClasses}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {busy ? busyLabel : idleLabel}
    </button>
  )
}
