'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className="inline-flex items-center justify-center gap-2 min-h-[38px] min-w-[38px] px-2.5 py-2
                 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300
                 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
    >
      {isLight ? (
        <Moon className="w-4 h-4 text-indigo-500" />
      ) : (
        <Sun className="w-4 h-4 text-amber-400" />
      )}
      {showLabel && (
        <span className="text-xs font-medium">{isLight ? 'Dark mode' : 'Light mode'}</span>
      )}
    </button>
  )
}
