'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpFromLine, CheckCircle2, Loader2, Mail, Shield, UploadCloud } from 'lucide-react'
import { useToast } from '@/lib/toast'

type UploadedItem = {
  token: string
  name: string
  size: number
  folderPath: string | null
}

type SelectedShareItem = {
  file: File
  folderPath: string | null
}

type CompletedShare = {
  tokens: string[]
  recipientEmail: string | null
  pinProtected: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export const dynamic = 'force-dynamic'

export default function PublicSharePage() {
  const toast = useToast()
  const [files, setFiles] = useState<SelectedShareItem[]>([])
  const [senderName, setSenderName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [pin, setPin] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploaded, setUploaded] = useState<UploadedItem[]>([])
  const [done, setDone] = useState(false)
  const [completedShare, setCompletedShare] = useState<CompletedShare | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  )

  function getFolderPath(file: File): string | null {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
    if (!relativePath || !relativePath.includes('/')) return null
    const folder = relativePath.slice(0, relativePath.lastIndexOf('/')).trim()
    return folder || null
  }

  function handleSelect(list: FileList | null) {
    if (!list?.length) return
    setFiles(Array.from(list).map(file => ({ file, folderPath: getFolderPath(file) })))
    setDone(false)
    setUploaded([])
    setCompletedShare(null)
  }

  function buildShareUrl(token: string): string {
    if (typeof window === 'undefined') return `/public-share/${token}`
    return new URL(`/public-share/${token}`, window.location.origin).toString()
  }

  function buildBatchShareUrl(tokens: string[]): string {
    if (tokens.length === 1) return buildShareUrl(tokens[0])
    const joined = tokens.join(',')
    if (typeof window === 'undefined') return `/public-share/batch?tokens=${encodeURIComponent(joined)}`
    return new URL(`/public-share/batch?tokens=${encodeURIComponent(joined)}`, window.location.origin).toString()
  }

  async function copyLink(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedLink(label)
      toast.success('Link copied.')
      window.setTimeout(() => {
        setCopiedLink(current => (current === label ? null : current))
      }, 2000)
    } catch {
      toast.error('Could not copy the link. Please copy it manually.')
    }
  }

  async function uploadViaPresign(
    file: File,
    folderPath: string | null,
    sharedMeta: { title: string; message: string; recipientEmail: string; pin: string },
  ) {
    const presignRes = await fetch('/api/public-share/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        folderPath,
        title: sharedMeta.title || null,
        message: sharedMeta.message || null,
        recipientEmail: sharedMeta.recipientEmail || null,
        pin: sharedMeta.pin || null,
      }),
    })

    const presignBody = await presignRes.json().catch(() => ({})) as {
      error?: string
      token?: string
      presignedUrl?: string
    }

    if (!presignRes.ok || !presignBody.token || !presignBody.presignedUrl) {
      throw new Error(presignBody.error ?? `Failed to prepare upload for ${file.name}.`)
    }

    const putRes = await fetch(presignBody.presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })

    if (!putRes.ok) {
      throw new Error(`Upload failed for ${file.name}.`)
    }

    const confirmRes = await fetch(`/api/public-share/${presignBody.token}/confirm`, { method: 'POST' })
    const confirmBody = await confirmRes.json().catch(() => ({})) as { error?: string }
    if (!confirmRes.ok) {
      throw new Error(confirmBody.error ?? `Could not confirm ${file.name}.`)
    }

    return presignBody.token
  }

  async function uploadViaFallback(
    file: File,
    folderPath: string | null,
    sharedMeta: { title: string; message: string; recipientEmail: string; pin: string },
  ) {
    const form = new FormData()
    form.append('file', file)
    form.append('filename', file.name)
    form.append('fileSize', String(file.size))
    form.append('mimeType', file.type || 'application/octet-stream')
    if (folderPath) form.append('folderPath', folderPath)
    if (sharedMeta.title) form.append('title', sharedMeta.title)
    if (sharedMeta.message) form.append('message', sharedMeta.message)
    if (sharedMeta.recipientEmail) form.append('recipientEmail', sharedMeta.recipientEmail)
    if (sharedMeta.pin) form.append('pin', sharedMeta.pin)

    const res = await fetch('/api/public-share/upload', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({})) as { error?: string; token?: string }
    if (!res.ok || !body.token) {
      throw new Error(body.error ?? `Fallback upload failed for ${file.name}.`)
    }

    return body.token
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) {
      toast.error('Please choose at least one file.')
      return
    }
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      toast.error('Please enter a valid recipient email address.')
      return
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast.error('PIN must be 4 to 8 digits.')
      return
    }

    setSending(true)
    setDone(false)
    setUploaded([])
    setCompletedShare(null)
    setProgress('Preparing upload...')

    const meta = {
      title: title.trim(),
      message: message.trim(),
      recipientEmail: recipientEmail.trim(),
      pin: pin.trim(),
    }

    const uploadedRows: UploadedItem[] = []
    const tokens: string[] = []

    try {
      for (let i = 0; i < files.length; i += 1) {
        const { file, folderPath } = files[i]
        const locationLabel = folderPath ? `${folderPath}/${file.name}` : file.name
        setProgress(`Uploading ${i + 1} of ${files.length}: ${locationLabel}`)

        let token: string
        try {
          token = await uploadViaPresign(file, folderPath, meta)
        } catch {
          token = await uploadViaFallback(file, folderPath, meta)
        }

        tokens.push(token)
        uploadedRows.push({ token, name: file.name, size: file.size, folderPath })
        setUploaded([...uploadedRows])
      }

      if (meta.recipientEmail) {
        setProgress('Sending email notification...')
        const notifyRes = await fetch('/api/public-share/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: meta.recipientEmail,
            tokens,
            senderTitle: senderName.trim() || title.trim() || 'Someone',
          }),
        })
        const notifyBody = await notifyRes.json().catch(() => ({})) as { error?: string }
        if (!notifyRes.ok) {
          throw new Error(notifyBody.error ?? 'Files uploaded, but the email notification could not be sent.')
        }
      }

      setDone(true)
      setProgress('')
      setCompletedShare({
        tokens,
        recipientEmail: meta.recipientEmail || null,
        pinProtected: Boolean(meta.pin),
      })
      toast.success(meta.recipientEmail ? 'Files uploaded and share email sent.' : 'Files uploaded successfully.')
    } catch (err) {
      setProgress('')
      toast.error(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-950/30">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Christhood ShareLink</p>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Send files with a secure download link</h1>
            </div>
          </div>
          <Link href="/public-share/legal" className="text-sm text-slate-400 transition hover:text-white">
            Terms & Privacy
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6">
              <p className="text-sm text-slate-400">
                Use ShareLink for people outside your team. Upload files or whole folders, optionally email the recipient, and keep the transfer protected with an expiry window and optional PIN.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-5">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-300">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">Choose files or folders to share</p>
                    <p className="mt-1 text-sm text-slate-400">Select files for a simple share, or pick a folder to keep its structure intact.</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <label className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500">
                      Browse files
                      <input type="file" multiple className="hidden" onChange={(e) => handleSelect(e.target.files)} />
                    </label>
                    <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
                      Browse folder
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                        onChange={(e) => handleSelect(e.target.files)}
                      />
                    </label>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
                      <p className="text-xs text-slate-400">{formatBytes(totalSize)}</p>
                    </div>
                    <div className="max-h-52 space-y-2 overflow-auto">
                      {files.map(({ file, folderPath }) => (
                        <div key={`${folderPath ?? ''}/${file.name}-${file.size}`} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                          <span className="truncate pr-3 text-slate-200">{folderPath ? `${folderPath}/${file.name}` : file.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Your name (optional)</label>
                  <input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    placeholder="Who is sending?"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Recipient email (optional)</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Transfer title (optional)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="Sunday service photos"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Message (optional)</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="Add a short note for the recipient"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Optional PIN</label>
                  <input
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    placeholder="4 to 8 digits"
                  />
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <p className="text-sm font-medium text-white">Recipient experience</p>
                  <p className="mt-1 text-sm text-slate-400">
                    They&apos;ll receive a secure external link and download the files in their original format.
                  </p>
                </div>
              </div>

              {progress && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
                  {progress}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                  {sending ? 'Uploading...' : 'Send files'}
                </button>
                <p className="text-xs text-slate-500">Links expire automatically after 7 days.</p>
              </div>
            </div>
          </form>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold text-white">How it works</h2>
              <ol className="mt-4 space-y-3 text-sm text-slate-400">
                <li>1. Select one or more files.</li>
                <li>2. Add recipient details if you want us to email them.</li>
                <li>3. We upload and generate secure download links.</li>
                <li>4. Recipients download the original files directly.</li>
              </ol>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold text-white">After upload</h2>
              {done ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                    Share complete
                  </p>
                  <p className="text-sm text-slate-300">
                    The upload worked. Use the link below to open, copy, or send the share.
                  </p>

                  {completedShare && (
                    <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-2.5 py-1 font-medium ${completedShare.pinProtected ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {completedShare.pinProtected ? 'PIN required' : 'No PIN'}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                          {completedShare.recipientEmail ? `Email sent to ${completedShare.recipientEmail}` : 'Manual sharing'}
                        </span>
                      </div>

                      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                          {completedShare.tokens.length > 1 ? 'Transfer link' : 'Share link'}
                        </p>
                        <p className="mt-2 break-all text-sm text-slate-200">
                          {buildBatchShareUrl(completedShare.tokens)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={buildBatchShareUrl(completedShare.tokens)}
                            target="_blank"
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                          >
                            Open link
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyLink('transfer', buildBatchShareUrl(completedShare.tokens))}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                          >
                            {copiedLink === 'transfer' ? 'Copied' : 'Copy link'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {uploaded.map((item) => (
                      <div
                        key={item.token}
                        className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3 text-sm text-slate-200"
                      >
                        <span className="block truncate">{item.folderPath ? `${item.folderPath}/${item.name}` : item.name}</span>
                        <span className="text-xs text-slate-500">{formatBytes(item.size)}</span>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={buildShareUrl(item.token)}
                            target="_blank"
                            className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-600"
                          >
                            Open file link
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyLink(item.token, buildShareUrl(item.token))}
                            className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                          >
                            {copiedLink === item.token ? 'Copied' : 'Copy file link'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Once your files finish uploading, the share links will appear here so you can verify or copy them.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
