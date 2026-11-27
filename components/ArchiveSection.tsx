'use client'

/**
 * ArchiveSection
 *
 * Collapsible section rendered below active media in the folder browser.
 * Shows archived files in a visually distinct grid with a muted amber tone.
 * Collapsed by default unless there are ≤ 5 archived files (then auto-expanded).
 */

import { useState }                         from 'react'
import { Archive, ChevronDown, ChevronUp }  from 'lucide-react'
import { MediaGrid }                        from '@/components/MediaGrid'
import type { MediaFile, TagItem }          from '@/types'

type EnrichedMedia = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  files:   EnrichedMedia[]
  isAdmin: boolean
}

export function ArchiveSection({ files, isAdmin: _isAdmin }: Props) {
  // Auto-expand when there are few archived files
  const [open, setOpen] = useState(files.length > 0 && files.length <= 5)

  if (files.length === 0) return null

  return (
    <section className="mt-8">
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3
                   px-4 py-3 rounded-xl
                   bg-amber-950/30 border border-amber-800/30
                   hover:bg-amber-950/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <Archive className="w-4 h-4 text-amber-500/70 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold text-amber-300/80">
              Archived
            </p>
            <p className="text-xs text-amber-600/70">
              {files.length} file{files.length !== 1 ? 's' : ''} — excluded from batch exports
            </p>
          </div>
        </div>
        <div className="text-amber-600/60 group-hover:text-amber-500/80 transition-colors shrink-0">
          {open
            ? <ChevronUp  className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />
          }
        </div>
      </button>

      {/* ── Expanded grid ────────────────────────────────────────────────── */}
      {open && (
        <div className="mt-4 p-4 rounded-2xl bg-amber-950/10 border border-amber-800/15">
          <MediaGrid files={files} />
        </div>
      )}
    </section>
  )
}
