'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/lib/toast'

interface FileItem {
  token: string
  originalName: string
  folderPath: string | null
  fileSize: string
  mimeType: string
  title: string | null
  message: string | null
  expiresAt: string
  downloadCount: number
  pinRequired: boolean
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
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
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fullName(file: FileItem): string {
  return file.folderPath ? `${file.folderPath}/${file.originalName}` : file.originalName
}

export default function BatchDownloadClient({ tokens }: { tokens: string }) {
  const toast = useToast()
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const hasProtectedFiles = files.some(file => file.pinRequired)
  const hasFolders = files.some(file => !!file.folderPath)
  const totalSize = files.reduce((sum, file) => sum + parseInt(file.fileSize, 10), 0)
  const transferTitle = files[0]?.title ?? null
  const transferMsg = files[0]?.message ?? null
  const expiry = files[0] ? expiryCountdown(files[0].expiresAt) : ''
  const expiryDateStr = files[0] ? expiryDate(files[0].expiresAt) : ''

  useEffect(() => {
    if (!tokens) {
      setError('No files specified.')
      setLoading(false)
      return
    }

    fetch(`/api/public-share/batch?tokens=${encodeURIComponent(tokens)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error((body as { error?: string }).error ?? 'Failed to load files.')
        }
        return body
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setFiles(data)
        } else {
          setError((data as { error?: string }).error ?? 'Failed to load files.')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Network error. Please try again.'))
      .finally(() => setLoading(false))
  }, [tokens])

  function buildBundleDownloadUrl(): string {
    const params = new URLSearchParams({ tokens })
    if (pin) params.set('pin', pin)
    return `/api/public-share/batch/download?${params.toString()}`
  }

  function startBundleDownload() {
    if (hasProtectedFiles && !/^\d{4,8}$/.test(pin)) {
      setPinError('Enter the correct 4-8 digit PIN to download this transfer.')
      return
    }

    setPinError('')
    setDownloading(true)
    window.location.href = buildBundleDownloadUrl()
    window.setTimeout(() => setDownloading(false), 3000)
  }

  async function downloadWithFolders() {
    const picker = (window as unknown as {
      showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker

    if (typeof picker !== 'function') {
      toast.error('This browser cannot save folders directly. Use the ZIP download instead.')
      return
    }

    if (hasProtectedFiles && !/^\d{4,8}$/.test(pin)) {
      setPinError('Enter the correct 4-8 digit PIN to save this transfer.')
      return
    }

    setPinError('')
    setDownloading(true)

    try {
      const root = await picker({ mode: 'readwrite' })

      for (const file of files) {
        const itemUrl = `/api/public-share/${file.token}/download${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`
        const response = await fetch(itemUrl)
        if (!response.ok) {
          throw new Error('One or more files could not be prepared for download.')
        }

        const { downloadUrl } = await response.json() as { downloadUrl: string }
        const objectResponse = await fetch(downloadUrl)
        if (!objectResponse.ok) {
          throw new Error(`Could not fetch ${file.originalName}.`)
        }

        const blob = await objectResponse.blob()
        let directory = root

        if (file.folderPath) {
          for (const segment of file.folderPath.split('/').filter(Boolean)) {
            directory = await directory.getDirectoryHandle(segment, { create: true })
          }
        }

        const handle = await directory.getFileHandle(file.originalName, { create: true })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      }

      toast.success('Transfer saved with folder structure.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer save failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <header className="border-b border-slate-800/60 sticky top-0 z-10 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Christhood ShareLink</p>
            <h1 className="text-xl font-bold text-white">Transfer ready to download</h1>
          </div>
          <Link href="/public-share" className="text-sm text-slate-400 hover:text-white transition">
            Send files
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
            <h2 className="text-xl font-bold text-white">Files not found</h2>
            <p className="mt-3 text-sm text-slate-400">{error}</p>
          </div>
        )}

        {!loading && !error && files.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-300">
                    {transferTitle || 'Shared transfer'}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold text-white">
                    {files.length} file{files.length !== 1 ? 's' : ''} shared with you
                  </h2>
                  {transferMsg && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{transferMsg}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Download</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatBytes(totalSize)}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Files</p>
                  <p className="mt-1 text-sm font-semibold text-white">{files.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Expires</p>
                  <p className="mt-1 text-sm font-semibold text-white">{expiry}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Packaging</p>
                  <p className="mt-1 text-sm font-semibold text-white">{hasFolders ? 'Folders preserved' : 'One ZIP folder'}</p>
                </div>
              </div>

              {hasProtectedFiles && (
                <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-200">This transfer is PIN protected.</p>
                  <p className="mt-1 text-sm text-amber-100/80">
                    Enter the correct PIN once to unlock the whole transfer.
                  </p>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="4-8 digit PIN"
                    className="mt-3 w-full rounded-xl border border-amber-400/30 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-300 focus:outline-none"
                  />
                  {pinError && <p className="mt-2 text-sm text-red-300">{pinError}</p>}
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                <p className="text-sm text-indigo-100">
                  Use the main button below to download everything together in one ZIP folder. You do not need to click every file one by one anymore.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={startBundleDownload}
                  disabled={downloading}
                  className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {downloading ? 'Preparing download...' : `Download all ${files.length} files together`}
                </button>

                {hasFolders && (
                  <button
                    onClick={downloadWithFolders}
                    disabled={downloading}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-5 py-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    Save with original folder structure
                  </button>
                )}
              </div>

              <p className="mt-4 text-xs text-slate-500">
                Files are permanently deleted after {expiryDateStr}.
              </p>
            </section>

            <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <h3 className="text-lg font-semibold text-white">Included files</h3>
              <div className="mt-4 max-h-[32rem] space-y-2 overflow-auto">
                {files.map((file) => (
                  <div key={file.token} className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                    <p className="truncate text-sm font-medium text-white">{fullName(file)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatBytes(file.fileSize)}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
