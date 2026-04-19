'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import Link from 'next/link'
import {
  Upload, X, Eye, EyeOff, CheckCircle2, Copy, Check, ExternalLink,
  Send, FileText, Mail, Lock, RefreshCw, Plus, WifiOff, AlertCircle,
} from 'lucide-react'
import { useShareUpload } from '@/contexts/ShareUploadContext'

// --- Helpers -----------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// --- Component ---------------------------------------------------------------

export default function PublicSharePage() {
  // -- Form-only local state --------------------------------------------------
  const [files,          setFiles]          = useState<File[]>([])
  const [dragging,       setDragging]       = useState(false)
  const [title,          setTitle]          = useState('')
  const [message,        setMessage]        = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [pin,            setPin]            = useState('')
  const [showPin,        setShowPin]        = useState(false)
  const [formError,      setFormError]      = useState<string | null>(null)

  // Copy-link UI state (local, cosmetic only)
  const [copiedIdx,   setCopiedIdx]   = useState<number | null>(null)
  const [allCopied,   setAllCopied]   = useState(false)
  const [batchCopied, setBatchCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // -- Upload state from global context --------------------------------------
  const {
    status, files: uploadFiles, currentIdx,
    overallProgress, results, errorMsg, isNetworkError,
    batchUrl, emailSent,
    startUpload, retry, reset: ctxReset,
  } = useShareUpload()

  const isUploading = status === 'uploading' || status === 'confirming'
  const isDone      = status === 'done'
  const hasError    = status === 'error'

  // -- File selection ---------------------------------------------------------

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming)
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const fresh    = arr.filter(f => !existing.has(f.name + f.size))
      return [...prev, ...fresh].slice(0, 20)
    })
    setFormError(null)
  }, [])

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  // -- Submit -----------------------------------------------------------------

  function handleSubmit() {
    setFormError(null)
    if (files.length === 0) { setFormError('Please select at least one file.'); return }
    if (!title.trim())      { setFormError('Please enter a title for this transfer.'); return }
    startUpload(files, { title: title.trim(), message, recipientEmail, pin })
    setFiles([])
  }

  // -- Copy helpers -----------------------------------------------------------

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

  async function copyBatchUrl() {
    if (!batchUrl) return
    await navigator.clipboard.writeText(batchUrl)
    setBatchCopied(true)
    setTimeout(() => setBatchCopied(false), 2500)
  }

  function handleReset() {
    ctxReset()
    setFiles([]); setTitle(''); setMessage('')
    setRecipientEmail(''); setPin(''); setShowPin(false)
    setFormError(null)
  }

  // -- Shared nav bar ---------------------------------------------------------

  const navBar = (
    <nav className="border-b border-slate-800/60 px-5 py-3.5">
      <div className="max-w-lg mx-auto flex items-center justify-between">
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
          href="https://cmmschristhood.org/login"
          className="text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1"
        >
          Sign in to CMMS
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </nav>
  )

  // -- Success screen ---------------------------------------------------------

  if (isDone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
        {navBar}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] p-4">
          <div className="w-full max-w-lg">
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white text-center mb-1">Transfer complete</h1>
            <p className="text-slate-400 text-center mb-2">
              {results.length === 1
                ? `"${results[0].name}" is ready to share`
                : `${results.length} files are ready to share`}
            </p>

            {emailSent && (
              <p className="text-center text-emerald-400 text-sm mb-4 flex items-center justify-center gap-1.5">
                <Mail className="w-4 h-4" />
                Email sent to {recipientEmail}
              </p>
            )}

            {/* Batch link */}
            {batchUrl && (
              <div className="mb-4 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 p-4 space-y-2">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  One link for all {results.length} files
                </p>
                <p className="text-xs text-slate-400">Recipients can download all files at once from this single link</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={batchUrl}
                    className="flex-1 bg-slate-800/80 text-xs text-indigo-300 px-3 py-2 rounded-lg border border-slate-700/60 truncate focus:outline-none"
                    onFocus={e => e.currentTarget.select()} />
                  <button onClick={copyBatchUrl}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition">
                    {batchCopied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                  </button>
                </div>
              </div>
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
                      {copiedIdx === i
                        ? <><Check className="w-3.5 h-3.5" />Copied</>
                        : <><Copy className="w-3.5 h-3.5" />Copy link</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              {results.length > 1 && (
                <button onClick={copyAllLinks}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-700/70 text-white text-sm font-semibold hover:bg-slate-700 transition-colors border border-slate-600/50">
                  {allCopied
                    ? <><Check className="w-4 h-4 text-emerald-400" />All links copied</>
                    : <><Copy className="w-4 h-4" />Copy all links</>}
                </button>
              )}
              <button onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">
                <RefreshCw className="w-4 h-4" />Send another transfer
              </button>
            </div>

            <p className="text-center text-slate-600 text-xs mt-6">
              Links expire in 7 days ╖ Files are permanently deleted after expiry
            </p>
          </div>
        </main>
      </div>
    )
  }

  // -- Upload form + progress -------------------------------------------------

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      {navBar}
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] p-4">
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

          {/* -- Uploading / confirming -- */}
          {isUploading && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgb(30,41,59)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke={status === 'confirming' ? 'rgb(52,211,153)' : 'rgb(99,102,241)'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={status === 'confirming' ? 0 : 2 * Math.PI * 52 * (1 - overallProgress / 100)}
                    style={{ transition: 'stroke-dashoffset 0.4s ease-out, stroke 0.4s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  {status === 'confirming'
                    ? <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                    : <span className="text-3xl font-bold text-white tabular-nums leading-none">{overallProgress}%</span>
                  }
                </div>
              </div>

              {status === 'confirming' ? (
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-emerald-400">Transfer complete!</p>
                  <p className="text-xs text-slate-400">Preparing your share linkà</p>
                </div>
              ) : (
                <div className="text-center space-y-1">
                  {uploadFiles.length > 1 && (
                    <p className="text-sm font-medium text-indigo-300">
                      File {currentIdx + 1} of {uploadFiles.length}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 max-w-xs truncate px-4">
                    {uploadFiles[currentIdx]?.name}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    You can navigate away ù upload continues in the background
                  </p>
                </div>
              )}
            </div>
          )}

          {/* -- Network / upload error -- */}
          {hasError && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-900/20 border border-red-800/50">
                {isNetworkError
                  ? <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-red-300">
                    {isNetworkError ? 'Network error' : 'Upload error'}
                  </p>
                  <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
                  {results.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      {results.length} of {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} already uploaded ù retry will continue from where it stopped.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={retry}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  {results.length > 0
                    ? `Retry ù continue from file ${results.length + 1}`
                    : 'Retry upload'}
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm hover:bg-slate-700 transition-colors border border-slate-700/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* -- Upload form (shown when idle) -- */}
          {!isUploading && !hasError && (
            <>
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`group relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 select-none ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-900/20'
                    : 'border-slate-700 hover:border-indigo-500/60 hover:bg-slate-800/30'
                }`}
              >
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileInput} />
                {files.length === 0 ? (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                      Drop files here or <span className="text-indigo-400">browse</span>
                    </p>
                    <p className="text-xs text-slate-600">Up to 20 files ╖ any size</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-300">
                      {files.length} file{files.length !== 1 ? 's' : ''} ù {formatBytes(totalSize)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-indigo-400">
                      <Plus className="w-3.5 h-3.5" />Add more
                    </span>
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
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Wedding photos, Project filesà" maxLength={200}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Description <span className="text-slate-600">(optional)</span>
                </label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Add a short note for the recipientà" rows={2} maxLength={1000}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* Recipient email */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <Mail className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Send to email <span className="text-slate-600">(optional)</span>
                </label>
                <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
              </div>

              {/* PIN */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <Lock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  PIN protection <span className="text-slate-600">(optional ╖ 4û8 digits)</span>
                </label>
                <div className="relative">
                  <input type={showPin ? 'text' : 'password'} value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Enter a PINà" inputMode="numeric"
                    className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/60 transition" />
                  <button type="button" onClick={() => setShowPin(v => !v)}
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Form validation error */}
              {formError && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
                  {formError}
                </p>
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
          Files are deleted after 7 days ╖ By uploading you agree to our{' '}
          <Link href="/public-share/legal#terms"
            className="text-slate-500 hover:text-slate-400 transition-colors">Terms</Link>{' '}and{' '}
          <Link href="/public-share/legal#privacy"
            className="text-slate-500 hover:text-slate-400 transition-colors">Privacy Policy</Link>
        </p>
      </div>
      </main>
    </div>
  )
}

