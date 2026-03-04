'use client'

import { useState }                    from 'react'
import { FolderDown, Loader2, Check }  from 'lucide-react'

interface Props {
  eventId:       string
  eventName:     string
  subfolderId?:  string | null
  subfolderLabel?: string | null
  fileCount?:    number
  className?:    string
}

/**
 * BatchDownloadButton
 *
 * Available to ADMIN and EDITOR roles only.
 * Streams a ZIP archive of all files in an event (or subfolder) from the server.
 */
export function BatchDownloadButton({
  eventId, eventName, subfolderId, subfolderLabel, fileCount, className = '',
}: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleBatchDownload(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (state === 'loading') return

    setState('loading')
    setError('')

    try {
      const res = await fetch('/api/download/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ eventId, subfolderId: subfolderId ?? undefined }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }

      // Stream the response body to a Blob, then trigger a download
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') ?? ''
      const match  = contentDisposition.match(/filename="([^"]+)"/)
      const zipName = match?.[1] ?? `${eventName.replace(/\s+/g, '_')}.zip`

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = zipName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch (err: any) {
      setError(err.message ?? 'Batch download failed')
      setState('error')
    }
  }

  const label = subfolderLabel
    ? `Download "${subfolderLabel}"`
    : `Download all${fileCount != null ? ` (${fileCount} files)` : ''}`

  return (
    <button
      onClick={handleBatchDownload}
      disabled={state === 'loading'}
      title={error || label}
      className={`flex items-center gap-2 text-sm font-medium transition rounded-xl px-4 py-2.5
        ${state === 'done'
          ? 'bg-emerald-700/60 text-emerald-300 border border-emerald-700/40'
          : state === 'error'
            ? 'bg-red-900/40 text-red-300 border border-red-800/40'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
        } disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {state === 'done'    && <Check   className="w-4 h-4 shrink-0" />}
      {(state === 'idle' || state === 'error') &&
        <FolderDown className="w-4 h-4 shrink-0" />
      }
      <span>
        {state === 'loading' ? 'Building ZIP…'
          : state === 'done'  ? 'Download started'
          : state === 'error' ? (error.length < 40 ? error : 'Try again')
          : label}
      </span>
    </button>
  )
}
