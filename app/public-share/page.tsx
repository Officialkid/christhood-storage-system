'use client'

import { useCallback, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
type UploadStep = 'idle' | 'uploading' | 'done' | 'error'

const MAX_FILE_SIZE = 50 * 1024 * 1024   // 50 MB

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PublicSharePage() {
  const [file,        setFile]        = useState<File | null>(null)
  const [dragging,    setDragging]    = useState(false)
  const [title,       setTitle]       = useState('')
  const [message,     setMessage]     = useState('')
  const [pin,         setPin]         = useState('')
  const [progress,    setProgress]    = useState(0)
  const [step,        setStep]        = useState<UploadStep>('idle')
  const [shareUrl,    setShareUrl]    = useState('')
  const [expiresAt,   setExpiresAt]   = useState('')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [copied,      setCopied]      = useState(false)
  const fileInputRef                  = useRef<HTMLInputElement>(null)

  // ── File selection ────────────────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      setErrorMsg(`File is too large. Maximum size is 50 MB.`)
      setStep('error')
      return
    }
    setFile(f)
    setErrorMsg('')
    setStep('idle')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  // ── Upload flow ───────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return
    setStep('uploading')
    setProgress(0)
    setErrorMsg('')

    try {
      // Step 1 — POST metadata, get presigned upload URL + token
      const initRes = await fetch('/api/public-share/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          title:    title.trim()   || undefined,
          message:  message.trim() || undefined,
          pin:      pin.trim()     || undefined,
        }),
      })
      if (!initRes.ok) {
        const data = await initRes.json().catch(() => ({}))
        throw new Error(data.error ?? `Server error (${initRes.status})`)
      }
      const { token, uploadUrl, expiresAt: exp } = await initRes.json()

      // Step 2 — Upload directly to R2 via presigned PUT URL (with progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload  = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`R2 upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload.'))
        xhr.send(file)
      })
      setProgress(100)

      // Step 3 — Confirm to backend (marks isReady = true)
      const confirmRes = await fetch(`/api/public-share/${token}/confirm`, { method: 'POST' })
      if (!confirmRes.ok) throw new Error('Failed to confirm upload.')

      // Step 4 — Build the share URL and show success screen
      const origin = window.location.origin
      setShareUrl(`${origin}/public-share/${token}`)
      setExpiresAt(exp)
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setStep('error')
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = () => {
    setFile(null); setStep('idle'); setShareUrl(''); setExpiresAt('')
    setTitle(''); setMessage(''); setPin(''); setProgress(0); setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Render: success screen ────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">File shared!</h2>
          <p className="text-sm text-gray-500">
            The link expires on <span className="font-medium text-gray-700">{formatExpiry(expiresAt)}</span>
            {' '}(7 days). After that it is permanently deleted.
          </p>

          {/* Share URL */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-sm font-mono text-gray-800 truncate">{shareUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {pin && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">
              <strong>PIN protected.</strong> Make sure to share the PIN separately with the recipient.
            </p>
          )}

          <button
            onClick={handleReset}
            className="text-sm text-indigo-600 hover:underline"
          >
            Share another file
          </button>
        </div>
      </div>
    )
  }

  // ── Render: upload form ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Share a file</h1>
          <p className="mt-1 text-sm text-gray-500">
            No account needed. Links expire automatically after 7 days.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition
            ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-slate-50'}
            ${file ? 'py-4' : 'py-10'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onInputChange}
          />

          {file ? (
            <div className="flex items-center gap-3 px-4">
              <svg className="w-8 h-8 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="text-gray-400 hover:text-red-500 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-700">Drop your file here or <span className="text-indigo-600">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">Max 50 MB</p>
            </>
          )}
        </div>

        {/* Optional fields */}
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Title (optional)"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Message to recipient (optional)"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="relative">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              maxLength={8}
              placeholder="PIN (4–8 digits, optional)"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
              {pin ? `${pin.length}/8` : ''}
            </span>
          </div>
        </div>

        {/* Progress bar (visible during upload) */}
        {step === 'uploading' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {step === 'error' && errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{errorMsg}</p>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || step === 'uploading'}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white
            hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {step === 'uploading' ? 'Uploading…' : 'Share file'}
        </button>

        <p className="text-center text-xs text-gray-400">
          Files are automatically deleted after 7 days.
          By uploading you agree to our{' '}
          <a href="/terms" target="_blank" className="underline hover:text-gray-600">Terms</a> and{' '}
          <a href="/privacy" target="_blank" className="underline hover:text-gray-600">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
