'use client'

import { useState }                from 'react'
import { Download, Loader2 }       from 'lucide-react'

interface Props {
  fileId:       string
  fileName:     string     // used for the browser's "Save As" suggestion
  className?:   string
  variant?:     'icon' | 'button' | 'link'
}

/**
 * DownloadButton
 *
 * Fetches a fresh, short-lived presigned URL from /api/download/[fileId] and
 * immediately triggers a browser download — ensuring every download is
 * authenticated, role-checked, and logged server-side.
 */
export function DownloadButton({
  fileId, fileName, className = '', variant = 'button',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (loading) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/download/${fileId}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const { url } = await res.json()

      // Trigger browser download via a temporary anchor
      const a    = document.createElement('a')
      a.href     = url
      a.download = fileName
      a.rel      = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      setError(err.message ?? 'Download failed')
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleDownload}
        title={error || `Download ${fileName}`}
        className={`p-1.5 rounded-lg transition
          ${error
            ? 'text-red-400 bg-red-900/30'
            : 'text-slate-400 hover:text-white hover:bg-slate-700'
          } ${className}`}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Download className="w-4 h-4" />
        }
      </button>
    )
  }

  if (variant === 'link') {
    return (
      <button
        onClick={handleDownload}
        className={`text-indigo-400 hover:text-indigo-300 text-sm underline-offset-2
                    hover:underline transition disabled:opacity-50 ${className}`}
        disabled={loading}
      >
        {loading ? 'Getting URL…' : error ? error : 'Download'}
      </button>
    )
  }

  // default: 'button'
  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`flex items-center justify-center gap-1.5 text-xs font-medium
                  rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white
                  px-3 py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed
                  ${className}`}
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Download className="w-3.5 h-3.5" />
      }
      {loading ? 'Preparing…' : error ? 'Retry' : 'Download'}
    </button>
  )
}
