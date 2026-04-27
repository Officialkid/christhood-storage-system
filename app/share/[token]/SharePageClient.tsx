'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Download, FileImage, FileVideo, File as FileIcon,
  Lock, AlertCircle, Clock, CheckCircle2, Archive, Eye,
  Loader2, X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareFile {
  id:         string
  name:       string
  size:       number
  sizeLabel:  string
  mimeType:   string
  folderPath: string | null
  canPreview: boolean
}

interface ShareLinkData {
  id:             string
  title:          string
  message:        string | null
  linkType:       string
  senderName:     string
  adminEmail:     string
  expiresAt:      string
  files:          ShareFile[]
  totalFiles:     number
  totalSize:      number
  totalSizeLabel: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileIcon(mimeType: string, className = 'w-5 h-5') {
  if (mimeType.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(mimeType)) {
    return <FileImage className={`${className} text-sky-400`} />
  }
  if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|heic)$/i.test(mimeType)) {
    return <FileVideo className={`${className} text-violet-400`} />
  }
  return <FileIcon className={`${className} text-slate-400`} />
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const d  = new Date(expiresAt)
  const ms = d.getTime() - Date.now()
  const hoursLeft = ms / 1000 / 60 / 60
  const color = hoursLeft < 24 ? 'text-amber-400' : 'text-slate-400'
  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Clock className="w-3 h-3" />
      Expires {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  )
}

// Group files by folderPath for display
function groupByFolder(files: ShareFile[]): Map<string, ShareFile[]> {
  const map = new Map<string, ShareFile[]>()
  for (const f of files) {
    const key = f.folderPath ?? ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(f)
  }
  return map
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SharePage({ token }: { token: string }) {
  const [phase,          setPhase]          = useState<'loading' | 'pin' | 'ready' | 'error'>('loading')
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null)
  const [data,           setData]           = useState<ShareLinkData | null>(null)
  const [pin,            setPin]            = useState('')
  const [pinError,       setPinError]       = useState<string | null>(null)
  const [pinLoading,     setPinLoading]     = useState(false)
  const [downloading,    setDownloading]    = useState<string | null>(null)  // fileId or 'all'
  const [downloadDone,   setDownloadDone]   = useState<Set<string>>(new Set())
  const [previewFile,    setPreviewFile]    = useState<ShareFile | null>(null)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Validated PIN persisted in-component so user doesn't re-enter per-file
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null)

  const fetchData = useCallback(async (pinValue?: string) => {
    const url = pinValue
      ? `/api/share/${token}?pin=${encodeURIComponent(pinValue)}`
      : `/api/share/${token}`
    const res = await fetch(url)
    if (res.status === 401) { setPhase('pin'); return }
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setErrorMsg(d.error ?? 'This link is not available.')
      setPhase('error')
      return
    }
    const json = await res.json() as ShareLinkData
    setData(json)
    if (pinValue) setVerifiedPin(pinValue)
    setPhase('ready')
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 4) { setPinError('Please enter a 4-digit PIN.'); return }
    setPinLoading(true)
    setPinError(null)
    const res = await fetch(`/api/share/${token}?pin=${encodeURIComponent(pin)}`)
    if (res.status === 403) { setPinError('Incorrect PIN. Please try again.'); setPinLoading(false); return }
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setErrorMsg(d.error ?? 'Link not available.')
      setPhase('error')
      return
    }
    const json = await res.json() as ShareLinkData
    setData(json)
    setVerifiedPin(pin)
    setPhase('ready')
    setPinLoading(false)
  }

  async function downloadFile(file: ShareFile) {
    if (downloading) return
    setDownloading(file.id)
    try {
      const pinParam = verifiedPin ? `&pin=${encodeURIComponent(verifiedPin)}` : ''
      const res = await fetch(`/api/share/${token}/download?fileId=${file.id}${pinParam}`)
      if (!res.ok) { alert('Download failed. Please try again.'); return }
      const { url, filename } = await res.json() as { url: string; filename: string }
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setDownloadDone(prev => new Set([...prev, file.id]))
    } catch {
      alert('Download failed — please check your connection.')
    } finally {
      setDownloading(null)
    }
  }

  async function downloadAll() {
    if (downloading) return
    if (!data?.files?.length) return
    setDownloading('all')
    const failed: string[] = []
    try {
      const pinParam = verifiedPin ? `&pin=${encodeURIComponent(verifiedPin)}` : ''
      for (const file of data.files) {
        try {
          const res = await fetch(`/api/share/${token}/download?fileId=${file.id}${pinParam}`)
          if (!res.ok) {
            failed.push(file.name)
            continue
          }
          const { url, filename } = await res.json() as { url: string; filename: string }
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.rel = 'noopener noreferrer'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setDownloadDone(prev => new Set([...prev, file.id]))
          await new Promise(resolve => setTimeout(resolve, 150))
        } catch {
          failed.push(file.name)
        }
      }
      if (failed.length) {
        alert(`Some files could not be downloaded: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`)
      }
    } catch {
      alert('Download failed — please check your connection.')
    } finally {
      setDownloading(null)
    }
  }

  async function openPreview(file: ShareFile) {
    setPreviewFile(file)
    setPreviewLoading(true)
    setPreviewUrl(null)
    try {
      const pinParam = verifiedPin ? `&pin=${encodeURIComponent(verifiedPin)}` : ''
      const res = await fetch(`/api/share/${token}/download?fileId=${file.id}${pinParam}`)
      if (!res.ok) { setPreviewLoading(false); return }
      const { url } = await res.json() as { url: string }
      setPreviewUrl(url)
    } catch { /* silent */ } finally {
      setPreviewLoading(false)
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm px-4 py-3 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Christhood CMMS</p>
            <p className="text-xs text-slate-500 leading-tight">Secure File Sharing</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-3xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 py-4 text-center">
        <p className="text-xs text-slate-600">
          Powered by Christhood CMMS — files shared via a time-limited secure link
        </p>
      </footer>
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
        </div>
      </Shell>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white mb-1">Link unavailable</h1>
            <p className="text-sm text-slate-400">{errorMsg}</p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── PIN entry ──────────────────────────────────────────────────────────────
  if (phase === 'pin') {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 max-w-sm mx-auto text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white mb-1">PIN required</h1>
            <p className="text-sm text-slate-400">This link is PIN-protected. Enter the 4-digit PIN to view the files.</p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(null) }}
              placeholder="0000"
              className="w-full text-center text-3xl font-mono tracking-[1rem] bg-slate-700/50 border border-slate-600
                         rounded-xl py-4 text-white placeholder:text-slate-600 focus:outline-none
                         focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
            />
            {pinError && <p className="text-sm text-red-400">{pinError}</p>}
            <button
              type="submit"
              disabled={pin.length !== 4 || pinLoading}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                         text-white text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {pinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Unlock files
            </button>
          </form>
        </div>
      </Shell>
    )
  }

  // ── Ready — file list ─────────────────────────────────────────────────────
  if (!data) return null
  const grouped = groupByFolder(data.files)
  const folders = [...grouped.keys()].sort()

  return (
    <Shell>
      <div className="space-y-6">

        {/* ── Header card ── */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight truncate">{data.title}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Shared by <span className="text-slate-300">{data.senderName}</span>
              </p>
            </div>
            <ExpiryBadge expiresAt={data.expiresAt} />
          </div>

          {data.message && (
            <div className="p-3 rounded-xl bg-slate-700/40 border border-slate-600/30">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{data.message}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-sm text-slate-500">
              {data.totalFiles} file{data.totalFiles !== 1 ? 's' : ''} · {data.totalSizeLabel}
            </p>
            <button
              onClick={downloadAll}
              disabled={!!downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         disabled:opacity-50 text-white text-sm font-medium transition shrink-0"
            >
              {downloading === 'all'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Archive className="w-4 h-4" />}
              Download All Files
            </button>
          </div>
        </div>

        {/* ── File list ── */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
          {folders.map((folder, fi) => (
            <div key={folder} className={fi > 0 ? 'border-t border-slate-700/40' : ''}>
              {folder && (
                <div className="px-4 py-2 bg-slate-700/30 border-b border-slate-700/40 flex items-center gap-2">
                  <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-medium text-slate-300">{folder}</span>
                </div>
              )}
              {grouped.get(folder)!.map((file, i) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-700/20 transition
                              ${i > 0 || folder ? 'border-t border-slate-700/30' : ''}`}
                >
                  <div className="shrink-0">{fileIcon(file.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate font-medium">{file.name}</p>
                    <p className="text-xs text-slate-500">{file.sizeLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {file.canPreview && (
                      <button
                        onClick={() => openPreview(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    {downloadDone.has(file.id) && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <button
                      onClick={() => downloadFile(file)}
                      disabled={!!downloading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700/60
                                  hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white
                                  text-xs font-medium transition"
                    >
                      {downloading === file.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Contact footer ── */}
        <p className="text-center text-xs text-slate-600 pb-2">
          Questions about these files? Contact{' '}
          <a href={`mailto:${data.adminEmail}`} className="text-slate-500 hover:text-slate-300 underline underline-offset-2">
            {data.adminEmail}
          </a>
        </p>
      </div>

      {/* ── Image preview modal ─────────────────────────────────────────────── */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setPreviewFile(null); setPreviewUrl(null) }}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700/50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
              <span className="text-sm font-medium text-slate-200 truncate">{previewFile.name}</span>
              <button
                onClick={() => { setPreviewFile(null); setPreviewUrl(null) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition ml-2 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-48 flex items-center justify-center bg-slate-950/60">
              {previewLoading && <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />}
              {previewUrl && !previewLoading && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={previewFile.name}
                  className="max-h-[70vh] w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
