/**
 * StatusBadge
 * Displays a coloured pill for a MediaFile's current status.
 * Pure presentational — no props beyond the status string.
 */

type AnyStatus = string

interface StatusConfig {
  label:   string
  classes: string
}

const CONFIG: Record<string, StatusConfig> = {
  RAW:                 { label: 'Raw',       classes: 'bg-slate-700/80  text-slate-300  ring-slate-600' },
  EDITING_IN_PROGRESS: { label: 'Editing',   classes: 'bg-amber-950/80  text-amber-400  ring-amber-800' },
  EDITED:              { label: 'Edited',    classes: 'bg-blue-950/80   text-blue-400   ring-blue-800'  },
  PUBLISHED:           { label: 'Published', classes: 'bg-emerald-950/80 text-emerald-400 ring-emerald-800' },
  ARCHIVED:            { label: 'Archived',  classes: 'bg-violet-950/80 text-violet-400 ring-violet-800' },
  DELETED:             { label: 'Deleted',   classes: 'bg-red-950/80    text-red-400    ring-red-800'   },
  PURGED:              { label: 'Purged',    classes: 'bg-red-950/80    text-red-300    ring-red-700'   },
}

interface Props {
  /** FileStatus enum value */
  status: AnyStatus
  /** 'sm' = compact (default, on cards); 'md' = slightly larger (tables, detail views) */
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, size = 'sm', className = '' }: Props) {
  const cfg = CONFIG[status] ?? {
    label:   status,
    classes: 'bg-slate-700/80 text-slate-300 ring-slate-600',
  }

  const sizeClass =
    size === 'md'
      ? 'text-xs px-2.5 py-1 leading-tight'
      : 'text-[10px] px-1.5 py-0.5 leading-none'

  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold tracking-wide
                  ring-1 ring-inset select-none
                  ${cfg.classes} ${sizeClass} ${className}`}
    >
      {cfg.label}
    </span>
  )
}
