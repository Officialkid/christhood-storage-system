'use client'

import type React from 'react'

interface Props {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function GallerySettingToggle({
  icon, label, description, checked, onChange, disabled = false,
}: Props) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-sm text-slate-200">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative shrink-0 w-10 h-5.5 rounded-full border transition-colors
          ${checked
            ? 'bg-indigo-600 border-indigo-500'
            : 'bg-slate-700 border-slate-600'}
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ height: '22px' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                      transition-transform duration-200
                      ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}
