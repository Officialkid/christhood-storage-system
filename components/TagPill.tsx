/**
 * TagPill
 * A small display-only pill for a single tag.
 * Optionally renders a remove (×) button when `onRemove` is provided.
 */

interface Props {
  name:       string
  onRemove?:  () => void
  /** 'sm' for media cards, 'md' for detail/filter views */
  size?:      'sm' | 'md'
  /** Highlight the pill (used for active tag filters) */
  active?:    boolean
  className?: string
}

export function TagPill({ name, onRemove, size = 'md', active = false, className = '' }: Props) {
  const sizeClass =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 leading-none gap-1'
      : 'text-xs px-2.5 py-1 leading-tight gap-1.5'

  const colorClass = active
    ? 'bg-indigo-600/80 text-indigo-100 ring-indigo-500'
    : 'bg-teal-950/70 text-teal-300 ring-teal-800/60'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium
                  ring-1 ring-inset select-none
                  ${colorClass} ${sizeClass} ${className}`}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="rounded-full hover:bg-white/10 transition-colors leading-none
                     flex items-center justify-center w-3.5 h-3.5 shrink-0"
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
