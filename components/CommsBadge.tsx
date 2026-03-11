import type { ReactNode } from 'react'

interface CommsBadgeProps {
  count:   number
  urgent?: boolean
  /** Extra Tailwind classes applied to the outer span */
  className?: string
}

/**
 * CommsBadge — reusable unread/pending count pill.
 *
 * Rendering rules:
 *  - 0           → renders nothing (returns null)
 *  - 1–99        → shows the exact number
 *  - 100+        → shows "99+"
 *  - urgent=true → red background regardless of count
 *  - urgent=false/undefined → indigo/primary background
 */
export function CommsBadge({ count, urgent = false, className = '' }: CommsBadgeProps): ReactNode {
  if (count <= 0) return null

  const label = count > 99 ? '99+' : String(count)
  const color = urgent
    ? 'bg-red-500 text-white'
    : 'bg-indigo-500 text-white'

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full
                  px-1.5 py-0.5 text-[10px] font-bold leading-none
                  min-w-[1.125rem] ${color} ${className}`}
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  )
}

/**
 * CommsBadgeSmall — tighter variant for icon overlays (in collapsed sidebar / mobile icon).
 */
export function CommsBadgeSmall({ count, urgent = false }: Omit<CommsBadgeProps, 'className'>): ReactNode {
  if (count <= 0) return null

  const label = count > 99 ? '99+' : String(count)
  const color = urgent ? 'bg-red-500' : 'bg-indigo-500'

  return (
    <span
      className={`absolute -top-1 -right-1 flex items-center justify-center
                  rounded-full ${color} text-white
                  h-3.5 min-w-3.5 px-0.5 text-[9px] font-bold leading-none`}
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  )
}
