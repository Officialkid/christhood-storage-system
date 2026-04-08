'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
interface ShareMeta {
  originalName:  string
  fileSize:      string   // BigInt serialised as string
  mimeType:      string
  title:         string | null
  message:       string | null
  expiresAt:     string
  downloadCount: number
  createdAt:     string
  pinRequired:   boolean
}

type ViewStep = 'loading' | 'pin' | 'ready' | 'notfound' | 'expired' | 'downloading' | 'error'

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (n < 1024)       return `${n} B`
  if (n < 1024 ** 2)  return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)  return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso))
}

function expiryCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  if (d > 0) return `${d}d ${h}h remaining`
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PublicShareViewClient({ token }: { token: string }) {
  const [step,     setStep]     = useState<ViewStep>('loading')
  const [meta,     setMeta]     = useState<ShareMeta | null>(null)
  const [pin,      setPin]      = useState('')
  const [pinError, setPinError] = useState('')
  const [errMsg,   setErrMsg]   = useState('')
  const [showPin,  setShowPin]  = useState(false)

  // ── Fetch metadata (called on mount and on PIN submit) ────────────────────
  const fetchMeta = useCallback(async (pinValue?: string) => {
    const url = `/api/public-share/${token}${pinValue ? `?pin=${encodeURIComponent(pinValue)}` : ''}`
    const res = await fetch(url)

    if (res.status === 404) {
      setStep('notfound')
      return
    }
    if (res.status === 401) {
      setStep('pin')
      return
    }
    if (res.status === 403) {
      setPinError('Incorrect PIN. Please try again.')
      setStep('pin')
      return
    }
    if (!res.ok) {
      setErrMsg(`Error loading share link (${res.status}).`)
      setStep('error')
      return
    }

    const data: ShareMeta = await res.json()
    setMeta(data)
    setStep('ready')
  }, [token])

  useEffect(() => { fetchMeta() }, [fetchMeta])

  // ── PIN submit ────────────────────────────────────────────────────────────
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,8}$/.test(pin)) {
      setPinError('PIN must be 4–8 digits.')
      return
    }
    setPinError('')
    setStep('loading')
    fetchMeta(pin)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setStep('downloading')
    try {
      const url = `/api/public-share/${token}/download${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      const { downloadUrl } = await res.json()
      // Navigate to presigned URL — browser handles the file download
      window.location.href = downloadUrl
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Download failed.')
      setStep('error')
    } finally {
      // Restore ready state after a short delay (navigation may take a moment)
      setTimeout(() => setStep('ready'), 3000)
    }
  }

  // ── Shared elements ───────────────────────────────────────────────────────
  const bg   = 'min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900'
  const card = 'bg-slate-900/70 border border-slate-700/50 rounded-2xl backdrop-blur-sm'

  const Nav = (
    <header className="border-b border-slate-800/60 px-5 py-3.5">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>
          <span className="text-sm font-bold text-white">Christhood ShareLink</span>
        </div>
        <a
          href="/public-share"
          className="text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1"
        >
          Share files
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </header>
  )

  // ── Render states ─────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className={`${bg} flex items-center justify-center`}>
        <div className="w-8 h-8 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'notfound' || step === 'expired') {
    return (
      <div className={bg}>
        {Nav}
        <div className="flex items-center justify-center min-h-[calc(100vh-57px)] p-4">
          <div className={`${card} p-8 max-w-sm w-full text-center space-y-4`}>
            <div className="w-14 h-14 bg-red-900/30 border border-red-800/50 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Link not found</h2>
            <p className="text-sm text-slate-400">
              This share link does not exist or has already expired. Links are automatically deleted after 7 days.
            </p>
            <a href="/public-share" className="inline-block text-sm text-indigo-400 hover:text-indigo-300 transition">Share a file →</a>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'pin') {
    return (
      <div className={bg}>
        {Nav}
        <div className="flex items-center justify-center min-h-[calc(100vh-57px)] p-4">
          <div className={`${card} p-8 max-w-sm w-full space-y-5`}>
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-900/30 border border-amber-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">PIN required</h2>
              <p className="text-sm text-slate-400 mt-1">Enter the PIN to access this shared file.</p>
            </div>
            <form onSubmit={handlePinSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  placeholder="4–8 digit PIN"
                  autoFocus
                  className="w-full text-center tracking-widest text-lg rounded-xl bg-slate-800/60 border border-slate-700/60 px-4 py-3 pr-12 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(v => !v)}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPin ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {pinError && <p className="text-sm text-red-400 text-center">{pinError}</p>}
              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className={bg}>
        {Nav}
        <div className="flex items-center justify-center min-h-[calc(100vh-57px)] p-4">
          <div className={`${card} p-8 max-w-sm w-full text-center space-y-4`}>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">{errMsg}</p>
            <button
              onClick={() => { setStep('loading'); fetchMeta(pin || undefined) }}
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline transition"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Ready / downloading state ─────────────────────────────────────────────
  return (
    <div className={bg}>
      {Nav}
      <div className="flex items-center justify-center min-h-[calc(100vh-57px)] px-4 py-10">
        <div className={`${card} p-8 max-w-md w-full shadow-2xl space-y-5`}>

          {/* File icon + name */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white truncate">{meta?.originalName}</h1>
              {meta?.title && (
                <p className="text-sm text-indigo-400 font-medium truncate">{meta.title}</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">{formatBytes(meta?.fileSize ?? '0')}</p>
            </div>
          </div>

          {/* Message */}
          {meta?.message && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3">
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{meta.message}</p>
            </div>
          )}

          {/* Expiry */}
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-slate-400">
              Expires {formatExpiry(meta?.expiresAt ?? '')}
              {' '}·{' '}
              <span className="font-medium text-indigo-400">{expiryCountdown(meta?.expiresAt ?? '')}</span>
            </span>
          </div>

          {meta && meta.downloadCount > 0 && (
            <p className="text-xs text-slate-500">
              Downloaded {meta.downloadCount} {meta.downloadCount === 1 ? 'time' : 'times'}
            </p>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={step === 'downloading'}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5
              text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow-lg shadow-indigo-900/30"
          >
            {step === 'downloading' ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Preparing download…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download file
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-600">
            Shared via{' '}
            <a href="https://cmmschristhood.org" className="text-indigo-500/70 hover:text-indigo-400 transition">
              Christhood CMMS
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
