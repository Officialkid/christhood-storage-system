'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FileItem {
  token:         string
  originalName:  string
  fileSize:      string
  mimeType:      string
  title:         string | null
  message:       string | null
  expiresAt:     string
  downloadCount: number
  pinRequired:   boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (n < 1024)       return `${n} B`
  if (n < 1024 ** 2)  return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)  return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function expiryCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  if (d > 0) return `${d}d ${h}h remaining`
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
}

function expiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BatchDownloadClient({ tokens }: { tokens: string }) {
  const [files,       setFiles]       = useState<FileItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloaded,  setDownloaded]  = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!tokens) { setError('No files specified.'); setLoading(false); return }

    fetch(`/api/public-share/batch?tokens=${encodeURIComponent(tokens)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setFiles(data)
        else setError((data as { error?: string }).error ?? 'Failed to load files.')
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false))
  }, [tokens])

  const downloadOne = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/public-share/${token}/download`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      const { downloadUrl } = await res.json() as { downloadUrl: string }
      window.location.href = downloadUrl
      setDownloaded(prev => new Set(prev).add(token))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed. Please try again.')
    }
  }, [])

  const downloadAll = async () => {
    const eligible = files.filter(f => !f.pinRequired)
    if (eligible.length === 0) return
    setDownloading(true)
    for (const file of eligible) {
      try {
        const res = await fetch(`/api/public-share/${file.token}/download`)
        if (!res.ok) continue
        const { downloadUrl } = await res.json() as { downloadUrl: string }
        const a = document.createElement('a')
        a.href     = downloadUrl
        a.download = file.originalName
        a.target   = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        await new Promise(r => setTimeout(r, 700))
        setDownloaded(prev => new Set(prev).add(file.token))
      } catch { /* continue with next file */ }
    }
    setDownloading(false)
  }

  const totalSize   = files.reduce((s, f) => s + parseInt(f.fileSize, 10), 0)
  const eligible    = files.filter(f => !f.pinRequired)
  const transferTitle  = files[0]?.title ?? null
  const transferMsg    = files[0]?.message ?? null
  const expiry         = files[0] ? expiryCountdown(files[0].expiresAt) : ''
  const expiryDateStr  = files[0] ? expiryDate(files[0].expiresAt) : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">

      {/* ── Brand header ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Upload cloud icon */}
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">Christhood ShareLink</p>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Secure file sharing</p>
            </div>
          </div>
          <Link
            href="/public-share"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            Share files
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Files not found</h2>
            <p className="text-slate-500 text-sm">{error}</p>
            <p className="text-slate-400 text-xs">These links may have expired or been deleted.</p>
          </div>
        )}

        {/* ── Empty ───────────────────────────────────────────────────────── */}
        {!loading && !error && files.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">No files available</h2>
            <p className="text-slate-500 text-sm">These links may have expired.</p>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {!loading && !error && files.length > 0 && (
          <>
            {/* Hero */}
            <div className="text-center space-y-2 pb-2">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {transferTitle ?? `${files.length} file${files.length !== 1 ? 's' : ''} shared with you`}
              </h1>
              {transferMsg && (
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">{transferMsg}</p>
              )}
              <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Expires {expiryDateStr}
                </span>
                <span className="font-medium text-indigo-600">{expiry}</span>
                <span>{files.length} file{files.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}</span>
              </div>
            </div>

            {/* Download All button */}
            {eligible.length > 1 && (
              <button
                onClick={downloadAll}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 active:scale-[.99] transition shadow-sm shadow-indigo-200"
              >
                {downloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Downloading files…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download all {eligible.length} files &nbsp;·&nbsp; {formatBytes(totalSize)}
                  </>
                )}
              </button>
            )}

            {/* File list */}
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
              {files.map((f) => (
                <div key={f.token} className="flex items-center gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.originalName}</p>
                    <p className="text-xs text-slate-400">{formatBytes(f.fileSize)}</p>
                  </div>

                  {/* Action */}
                  {f.pinRequired ? (
                    <Link
                      href={`/public-share/${f.token}`}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 hover:bg-amber-100 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Enter PIN
                    </Link>
                  ) : downloaded.has(f.token) ? (
                    <span className="shrink-0 flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Downloaded
                    </span>
                  ) : (
                    <button
                      onClick={() => downloadOne(f.token)}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 active:scale-95 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-slate-400">
              Shared via{' '}
              <a href="https://cmmschristhood.org" className="text-indigo-500 hover:underline">
                Christhood CMMS
              </a>
              {' '}· Files are permanently deleted after {expiryDateStr}
            </p>
          </>
        )}
      </main>
    </div>
  )
}
