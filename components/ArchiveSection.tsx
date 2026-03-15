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
import { useSession }                       from 'next-auth/react'
import { MediaCard }                        from '@/components/MediaCard'
import { PreviewModal }                     from '@/components/PreviewModal'
import type { MediaFile, AppRole, TagItem } from '@/types'
import { useRouter }                        from 'next/navigation'

type EnrichedMedia = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  files:   EnrichedMedia[]
  isAdmin: boolean
}

export function ArchiveSection({ files, isAdmin }: Props) {
  const router    = useRouter()
  const { data: session } = useSession()
  const role      = (session?.user?.role ?? (isAdmin ? 'ADMIN' : 'EDITOR')) as AppRole
  // Auto-expand when there are few archived files
  const [open,        setOpen]        = useState(files.length > 0 && files.length <= 5)
  const [previewFile, setPreviewFile] = useState<EnrichedMedia | null>(null)

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {files.map(m => (
              <div key={m.id} className="opacity-75 hover:opacity-100 transition-opacity">
                <MediaCard
                  media={m}
                  onPreview={(id) => {
                    const f = files.find(f => f.id === id)
                    if (f) setPreviewFile(f)
                  }}
                  onStatusChanged={() => router.refresh()}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview modal for archived files */}
      <PreviewModal
        file={previewFile}
        allFiles={files}
        role={role}
        onClose={() => setPreviewFile(null)}
        onStatusChanged={() => router.refresh()}
        onDeleted={() => router.refresh()}
      />
    </section>
  )
}
