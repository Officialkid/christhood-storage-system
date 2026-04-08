'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import Link from 'next/link'
import {
  Upload, X, Eye, EyeOff, CheckCircle2, Copy, Check, ExternalLink,
  Send, FileText, Loader2, Mail, Lock, RefreshCw, Plus,
} from 'lucide-react'

// --- Helpers -----------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface UploadResult {
  name: string
  shareUrl: string
  token: string
  size: number
}

// --- Component ---------------------------------------------------------------

export default function PublicSharePage() {
  // files
  const [files,     setFiles]    = useState<File[]>([])
  const [dragging,  setDragging] = useState(false)
  const fileInputRef             = useRef<HTMLInputElement>(null)

  // form fields
  const [title,          setTitle]          = useState('')
  const [message,        setMessage]        = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [pin,            setPin]            = useState('')
  const [showPin,        setShowPin]        = useState(false)

  // upload state
  const [uploading,  setUploading]  = useState(false)
  const [progress,   setProgress]   = useState<Record<string, number>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)

  // success state
  const [results,   setResults]   = useState<UploadResult[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [allCopied, setAllCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const isDone = results.length > 0

  // --- File selection --------------------------------------------------------

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming)
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const fresh    = arr.filter(f => !existing.has(f.name + f.size))
      return [...prev, ...fresh].slice(0, 20)
    })
    setErrorMsg(null)
  }, [])

  const removeFile = (idx: number) =>
    setFiles(prev => prev.filter((_, i) => i !== idx))

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  // --- Upload flow -----------------------------------------------------------

  async function uploadFile(file: File, idx: number): Promise<UploadResult> {
    setCurrentIdx(idx)

    const initRes = await fetch('/api/public-share/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        filename:       file.name,
        fileSize:       file.size,
        mimeType:       file.type || 'application/octet-stream',
        title:          title.trim() || null,
        message:        message.trim() || null,
        recipientEmail: recipientEmail.trim() || null,
        pin:            pin || null,
      }),
    })

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error ?? `Failed to initiate upload (${initRes.status})`)
    }

    const { token, uploadUrl } = await initRes.json() as { token: string; uploadUrl: string }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = e => {
        if (e.lengthComputable)
          setProgress(p => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }))
      }
      xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`R2 upload failed (${xhr.status})`))
      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.send(file)
    })

    const confirmRes = await fetch(`/api/public-share/${token}/confirm`, { method: 'POST' })
    if (!confirmRes.ok) throw new Error('Could not confirm upload. Please try again.')

    const shareUrl = `${window.location.origin}/public-share/${token}`
    return { name: file.name, shareUrl, token, size: file.size }
  }

  async function handleSubmit() {
    setErrorMsg(null)
    if (files.length === 0)  { setErrorMsg('Please select at least one file.'); return }
    if (!title.trim())       { setErrorMsg('Please enter a title for this transfer.'); return }
    const oversized = files.find(f => f.size > 50 * 1024 * 1024)
    if (oversized)           { setErrorMsg(`"${oversized.name}" exceeds the 50 MB limit.`); return }

    setUploading(true)
    setProgress({})
    const collected: UploadResult[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        collected.push(await uploadFile(files[i], i))
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.')
      setUploading(false)
      return
    }

    setResults(collected)
    setUploading(false)

    if (recipientEmail.trim() && collected.length > 0) {
      try {
        await fetch('/api/public-share/notify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            recipientEmail: recipientEmail.trim(),
            tokens:         collected.map(r => r.token),
            senderTitle:    title.trim(),
          }),
        })
        setEmailSent(true)
      } catch { /* non-fatal */ }
    }
  }

  async function copyLink(url: string, idx: number) {
    await navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2500)
  }

  async function copyAllLinks() {
    const text = results.map((r, i) => `File ${i + 1}: ${r.name}\n${r.shareUrl}`).join('\n\n')
    await navigator.clipboard.writeText(text)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2500)
  }

  function reset() {
    setFiles([]); setTitle(''); setMessage(''); setRecipientEmail('')
    setPin(''); setShowPin(false); setProgress({}); setResults([])
    setErrorMsg(null); setCopiedIdx(null); setAllCopied(false)
    setEmailSent(false); setUploading(false)
  }

  // --- Success screen --------------------------------------------------------

  if (isDone) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white text-center mb-1">Transfer complete</h1>
          <p className="text-slate-400 text-center mb-2">
            {results.length === 1 ? `"${results[0].name}" is ready to share` : `${results.length} files are ready to share`}
          </p>

          {emailSent && (
            <p className="text-center text-emerald-400 text-sm mb-4 flex items-center justify-center gap-1.5">
              <Mail className="w-4 h-4" />
              Email sent to {recipientEmail}
            </p>
          )}

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden mb-4">
            {results.map((r, i) => (
              <div key={r.token} className="flex items-center gap-3 px-5 py-4 border-b border-slate-700/40 last:border-0">
                <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{r.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(r.size)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href={r.shareUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/60 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />Open
                  </a>
                  <button onClick={() => copyLink(r.shareUrl, i)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/80 text-white text-xs font-medium hover:bg-indigo-600 transition-colors">
                    {copiedIdx === i ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy link</>}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            {results.length > 1 && (
              <button onClick={copyAllLinks}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-700/70 text-white text-sm font-semibold hover:bg-slate-700 transition-colors border border-slate-600/50">
                {allCopied ? <><Check className="w-4 h-4 text-emerald-400" />All links copied</> : <><Copy className="w-4 h-4" />Copy all links</>}
              </button>
            )}
            <button onClick={reset}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">
              <RefreshCw className="w-4 h-4" />Send another transfer
            </button>
          </div>

          <p className="text-center text-slate-600 text-xs mt-6">Links expire in 7 days · Files are permanently deleted after expiry</p>
        </div>
      </main>
    )
  }

  // --- Upload form -----------------------------------------------------------

  const totalSize       = files.reduce((s, f) => s + f.size, 0)
  const overallProgress = files.length === 0 ? 0
    : Math.round(Object.values(progress).reduce((s, v) => s + v, 0) / files.length)

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
              <Upload className="w-7 h-7 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">ShareLink</h1>
          <p className="text-slate-400 text-sm">Share files securely — no account needed</p>
        </div>

        <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6 space-y-5 backdrop-blur-sm shadow-2xl">

          {uploading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-indigo-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">
                  Uploading file {currentIdx + 1} of {files.length} — {files[currentIdx]?.name}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
              </div>
              <p className="text-slate-500 text-xs text-right">{overallProgress}%</p>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`group relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 select-none ${dragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-slate-700 hover:border-indigo-500/60 hover:bg-slate-800/30'}`}
              >
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileInput} />
                {files.length === 0 ? (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                      Drop files here or <span className="text-indigo-400">browse</span>
                    </p>
                    <p className="text-xs text-slate-600">Up to 20 files · 50 MB each</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-300">{files.length} file{files.length !== 1 ? 's' : ''} — {formatBytes(totalSize)}</span>
                    <span className="flex items-center gap-1 text-xs text-indigo-400"><Plus className="w-3.5 h-3.5" />Add more</span>
                  </div>
                )}
              </div>

              {/* File list */}
              {files.length > 0 && (
                <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {files.map((f, i) => (
                    <li key={f.name + f.size} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50">
                      <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="flex-1 text-sm text-slate-300 truncate">{f.name}</span>
                      <span className="text-xs text-slate-500 shrink-0">{formatBytes(f.size)}</span>
                      <button onClick={() => removeFile(i)} aria-label="Remove file"
                              className="shrink-0 text-slate-600 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wedding photos, Project files…" maxLength={200}
                       className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Description <span className="text-slate-600">(optional)</span>
                </label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Add a short note for the recipient…" rows={2} maxLength={1000}
                          className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* Recipient email */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <Mail className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Send to email <span className="text-slate-600">(optional)</span>
                </label>
                <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="recipient@example.com"
                       className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* PIN with show/hide */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <Lock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  PIN protection <span className="text-slate-600">(optional · 4–8 digits)</span>
                </label>
                <div className="relative">
                  <input type={showPin ? 'text' : 'password'} value={pin}
                         onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                         placeholder="Enter a PIN…" inputMode="numeric"
                         className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
                  <button type="button" onClick={() => setShowPin(v => !v)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {errorMsg && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">{errorMsg}</p>
              )}

              {/* Submit */}
              <button onClick={handleSubmit} disabled={files.length === 0 || !title.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-900/30">
                <Send className="w-4 h-4" />
                {files.length > 1 ? `Upload ${files.length} files` : 'Upload & share'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-slate-700 text-xs mt-6">
          Files are deleted after 7 days · By uploading you agree to our{' '}
          <Link href="/public-share/legal#terms"
                className="text-slate-500 hover:text-slate-400 transition-colors">Terms</Link>{' '}and{' '}
          <Link href="/public-share/legal#privacy"
                className="text-slate-500 hover:text-slate-400 transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </main>
  )
}