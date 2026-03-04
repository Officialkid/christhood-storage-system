'use client'

/**
 * components/MediaGrid.tsx
 *
 * Client wrapper that manages preview state for the media browser.
 * The server component (media/page.tsx) passes the enriched file list down;
 * this component handles the "click to preview" interaction and renders the
 * PreviewModal overlay.
 */

import { useState, useCallback } from 'react'
import { MediaCard }    from '@/components/MediaCard'
import { PreviewModal } from '@/components/PreviewModal'
import type { MediaFile, TagItem } from '@/types'

type EnrichedFile = MediaFile & {
  downloadUrl:  string
  thumbnailUrl: string | null
  tags?:        TagItem[]
}

interface Props {
  files: EnrichedFile[]
}

export function MediaGrid({ files }: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const handlePreview  = useCallback((id: string) => setPreviewId(id), [])
  const handleClose    = useCallback(() => setPreviewId(null), [])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {files.map((m) => (
          <MediaCard
            key={m.id}
            media={m}
            onPreview={handlePreview}
          />
        ))}
      </div>

      <PreviewModal fileId={previewId} onClose={handleClose} />
    </>
  )
}
