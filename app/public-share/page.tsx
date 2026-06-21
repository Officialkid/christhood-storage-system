'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpFromLine,
  CheckCircle2,
  Copy,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  Shield,
  UploadCloud,
  X,
} from 'lucide-react'
import { useToast } from '@/lib/toast'
import { buildTransferCode } from '@/lib/publicShareTransfers'
import { formatUploadSize, xhrPut } from '@/lib/upload/client-utils'

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
  transferCode: string
  recipientEmail: string | null
  pinProtected: boolean
}

type DeliveryMode = 'link' | 'email'

type UploadProgressState = {
  currentFileName: string
  fileCount: number
  fileIndex: number
  phase: 'preparing' | 'uploading' | 'finishing' | 'complete'
  percent: number
  totalBytes: number
  uploadedBytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatPath(item: SelectedShareItem | UploadedItem) {
  const fileName = 'file' in item ? item.file.name : item.name
  return item.folderPath ? `${item.folderPath}/${fileName}` : fileName
}

async function xhrUploadFormData(
  url: string,
  form: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total)
      }
    })
    xhr.addEventListener('load', () => {
      let parsed: unknown = {}
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        parsed = {}
      }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: parsed,
      })
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(form)
  })
}

export const dynamic = 'force-dynamic'

export default function PublicSharePage() {
  const toast = useToast()
  const [files, setFiles] = useState<SelectedShareItem[]>([])
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('link')
  const [senderName, setSenderName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [pin, setPin] = useState('')
  const [sending, setSending] = useState(false)
  const [uploaded, setUploaded] = useState<UploadedItem[]>([])
  const [done, setDone] = useState(false)
  const [completedShare, setCompletedShare] = useState<CompletedShare | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [progressState, setProgressState] = useState<UploadProgressState | null>(null)

  const totalSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  )

  const primaryTitle = useMemo(() => {
    if (title.trim()) return title.trim()
    const first = files[0]
    if (!first) return 'Untitled transfer'
    const folderRoot = first.folderPath?.split('/')[0]?.trim()
    return folderRoot || first.file.name
  }, [files, title])

  function getFolderPath(file: File): string | null {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
    if (!relativePath || !relativePath.includes('/')) return null
    const folder = relativePath.slice(0, relativePath.lastIndexOf('/')).trim()
    return folder || null
  }

  function resetFinishedState() {
    setDone(false)
    setUploaded([])
    setCompletedShare(null)
    setCopiedLink(null)
  }

  function handleSelect(list: FileList | null) {
    if (!list?.length) return
    const selected = Array.from(list).map(file => ({ file, folderPath: getFolderPath(file) }))
    setFiles(selected)
    if (!title.trim()) {
      const first = selected[0]
      const folderRoot = first?.folderPath?.split('/')[0]?.trim()
      setTitle(folderRoot || first?.file.name || '')
    }
    resetFinishedState()
  }

  function removeFile(index: number) {
    setFiles(current => current.filter((_, idx) => idx !== index))
    resetFinishedState()
  }

  function clearFiles() {
    setFiles([])
    resetFinishedState()
  }

  function buildShareUrl(token: string): string {
    if (typeof window === 'undefined') return `/public-share/${token}`
    return new URL(`/public-share/${token}`, window.location.origin).toString()
  }

  function buildTransferShareUrl(transferCode: string): string {
    if (typeof window === 'undefined') return `/t/${transferCode}`
    return new URL(`/t/${transferCode}`, window.location.origin).toString()
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

  function updateAggregateProgress(
    file: File,
    fileIndex: number,
    fileCount: number,
    completedBytesBeforeCurrent: number,
    currentFileLoaded: number,
  ) {
    const uploadedBytes = Math.min(completedBytesBeforeCurrent + currentFileLoaded, totalSize)
    const percent = totalSize > 0 ? Math.min(100, Math.round((uploadedBytes / totalSize) * 100)) : 0
    setProgressState({
      currentFileName: file.name,
      fileCount,
      fileIndex,
      phase: 'uploading',
      percent,
      totalBytes: totalSize,
      uploadedBytes,
    })
  }

  async function uploadViaPresign(
    file: File,
    folderPath: string | null,
    sharedMeta: { title: string; message: string; recipientEmail: string; pin: string; transferToken: string; transferCode: string },
    onProgress: (loaded: number, total: number) => void,
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
        transferToken: sharedMeta.transferToken,
        transferCode: sharedMeta.transferCode,
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

    await xhrPut(
      presignBody.presignedUrl,
      file,
      file.type || 'application/octet-stream',
      (pct) => {
        const loaded = Math.round((pct / 100) * file.size)
        onProgress(loaded, file.size)
      },
    )

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
    sharedMeta: { title: string; message: string; recipientEmail: string; pin: string; transferToken: string; transferCode: string },
    onProgress: (loaded: number, total: number) => void,
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
    form.append('transferToken', sharedMeta.transferToken)
    form.append('transferCode', sharedMeta.transferCode)

    const res = await xhrUploadFormData('/api/public-share/upload', form, onProgress)
    const body = (res.body ?? {}) as { error?: string; token?: string }
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

    if (deliveryMode === 'email' && !recipientEmail.trim()) {
      toast.error('Please enter the recipient email address.')
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
    setProgressState({
      currentFileName: files[0]?.file.name ?? '',
      fileCount: files.length,
      fileIndex: 1,
      phase: 'preparing',
      percent: 0,
      totalBytes: totalSize,
      uploadedBytes: 0,
    })

    const meta = {
      title: primaryTitle,
      message: message.trim(),
      recipientEmail: deliveryMode === 'email' ? recipientEmail.trim() : '',
      pin: pin.trim(),
      transferToken: crypto.randomUUID(),
      transferCode: '',
    }
    meta.transferCode = buildTransferCode(meta.transferToken)

    const uploadedRows: UploadedItem[] = []
    const tokens: string[] = []
    let completedBytes = 0

    try {
      for (let i = 0; i < files.length; i += 1) {
        const { file, folderPath } = files[i]
        setProgressState({
          currentFileName: file.name,
          fileCount: files.length,
          fileIndex: i + 1,
          phase: 'uploading',
          percent: totalSize > 0 ? Math.round((completedBytes / totalSize) * 100) : 0,
          totalBytes: totalSize,
          uploadedBytes: completedBytes,
        })

        const onFileProgress = (loaded: number) => {
          updateAggregateProgress(file, i + 1, files.length, completedBytes, loaded)
        }

        let token: string
        try {
          token = await uploadViaPresign(file, folderPath, meta, onFileProgress)
        } catch {
          token = await uploadViaFallback(file, folderPath, meta, onFileProgress)
        }

        completedBytes += file.size
        tokens.push(token)
        uploadedRows.push({ token, name: file.name, size: file.size, folderPath })
        setUploaded([...uploadedRows])
        setProgressState({
          currentFileName: file.name,
          fileCount: files.length,
          fileIndex: i + 1,
          phase: 'uploading',
          percent: totalSize > 0 ? Math.round((completedBytes / totalSize) * 100) : 100,
          totalBytes: totalSize,
          uploadedBytes: completedBytes,
        })
      }

      if (meta.recipientEmail) {
        setProgressState({
          currentFileName: files[files.length - 1]?.file.name ?? '',
          fileCount: files.length,
          fileIndex: files.length,
          phase: 'finishing',
          percent: 100,
          totalBytes: totalSize,
          uploadedBytes: totalSize,
        })

        const notifyRes = await fetch('/api/public-share/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: meta.recipientEmail,
            tokens,
            senderTitle: senderName.trim() || meta.title || 'Someone',
          }),
        })
        const notifyBody = await notifyRes.json().catch(() => ({})) as { error?: string }
        if (!notifyRes.ok) {
          throw new Error(notifyBody.error ?? 'Files uploaded, but the email notification could not be sent.')
        }
      }

      setDone(true)
      setProgressState({
        currentFileName: files[files.length - 1]?.file.name ?? '',
        fileCount: files.length,
        fileIndex: files.length,
        phase: 'complete',
        percent: 100,
        totalBytes: totalSize,
        uploadedBytes: totalSize,
      })
      setCompletedShare({
        tokens,
        transferCode: meta.transferCode,
        recipientEmail: meta.recipientEmail || null,
        pinProtected: Boolean(meta.pin),
      })
      window.setTimeout(() => {
        setProgressState(current => (current?.phase === 'complete' ? null : current))
      }, 1200)
      toast.success(meta.recipientEmail ? 'Files uploaded and share email sent.' : 'Files uploaded successfully.')
    } catch (err) {
      setProgressState(null)
      toast.error(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const transferUrl = completedShare ? buildTransferShareUrl(completedShare.transferCode) : null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.22),_transparent_34%),linear-gradient(180deg,_#050816_0%,_#0f172a_55%,_#020617_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-950/40">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200/80">Christhood ShareLink</p>
              <h1 className="text-xl font-semibold text-white sm:text-2xl">Create a transfer</h1>
            </div>
          </div>

          <Link href="/public-share/legal" className="text-sm text-slate-300 transition hover:text-white">
            Terms & Privacy
          </Link>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-white/10 bg-white/95 p-4 shadow-2xl shadow-black/20 backdrop-blur sm:p-6"
          >
            <div className="mx-auto max-w-2xl">
              <div className="mb-5">
                <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('link')}
                    className={`flex-1 rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition ${
                      deliveryMode === 'link'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Get a link
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('email')}
                    className={`flex-1 rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition ${
                      deliveryMode === 'email'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Send as email
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <section className="rounded-[1.75rem] bg-slate-100 p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">Files</p>
                      <p className="text-sm text-slate-500">
                        Add files or one full folder. Folder uploads keep the structure intact.
                      </p>
                    </div>
                    {files.length > 0 && (
                      <button
                        type="button"
                        onClick={clearFiles}
                        className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-indigo-300 bg-white px-4 py-5 text-center transition hover:border-indigo-500 hover:bg-indigo-50/40">
                      <UploadCloud className="mb-3 h-7 w-7 text-indigo-600" />
                      <span className="text-sm font-semibold text-slate-950">Add files</span>
                      <span className="mt-1 text-xs text-slate-500">Photos, videos, documents and more</span>
                      <input type="file" multiple className="hidden" onChange={(e) => handleSelect(e.target.files)} />
                    </label>

                    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-4 py-5 text-center transition hover:border-slate-500 hover:bg-slate-50">
                      <FolderOpen className="mb-3 h-7 w-7 text-slate-700" />
                      <span className="text-sm font-semibold text-slate-950">Add folder</span>
                      <span className="mt-1 text-xs text-slate-500">Keep nested files under one transfer</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                        onChange={(e) => handleSelect(e.target.files)}
                      />
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 rounded-[1.5rem] bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {files.length} file{files.length !== 1 ? 's' : ''} added
                          </p>
                          <p className="text-sm text-slate-500">
                            {formatBytes(totalSize)} total
                          </p>
                        </div>
                        <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                          Ready to send
                        </div>
                      </div>

                      <div className="space-y-2">
                        {files.slice(0, 4).map((item, index) => (
                          <div
                            key={`${item.folderPath ?? ''}/${item.file.name}-${item.file.size}-${index}`}
                            className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                              {item.folderPath ? <FolderOpen className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {item.file.name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {item.folderPath ? item.folderPath : 'Root'} · {formatBytes(item.file.size)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label={`Remove ${item.file.name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {files.length > 4 && (
                        <p className="mt-3 text-sm text-slate-500">
                          +{files.length - 4} more file{files.length - 4 !== 1 ? 's' : ''} included in this transfer.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {deliveryMode === 'email' && (
                  <div className="rounded-[1.5rem] bg-slate-100 p-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Recipient email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="w-full rounded-2xl border border-transparent bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                        placeholder="name@example.com"
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] bg-slate-100 p-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                      placeholder="Transfer title"
                    />
                  </div>

                  <div className="rounded-[1.5rem] bg-slate-100 p-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Your name</label>
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="rounded-[1.5rem] bg-slate-100 p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-800">Message</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                    placeholder="Add a short note"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[1.5rem] bg-slate-100 p-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-800">PIN protection</label>
                    <input
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="w-full rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400"
                      placeholder="4 to 8 digits"
                    />
                    <p className="mt-2 text-xs text-slate-500">Leave empty if no PIN is needed.</p>
                  </div>

                  <div className="rounded-[1.5rem] bg-slate-100 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-800">Expires in</p>
                    <div className="rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-900">
                      7 days
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Recipients can download before it expires.</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sending || files.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : deliveryMode === 'email' ? <Mail className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
                  {sending ? 'Transferring...' : deliveryMode === 'email' ? 'Send transfer' : 'Get transfer link'}
                </button>
              </div>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 text-white backdrop-blur">
              <p className="text-sm font-semibold text-indigo-200">Simple sharing</p>
              <h2 className="mt-2 text-2xl font-semibold">Built for normal users, not technical ones.</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>One transfer page instead of many separate file links.</li>
                <li>Email delivery when you want us to notify the recipient.</li>
                <li>Folder uploads keep the original structure intact.</li>
                <li>Optional PIN for the whole transfer.</li>
              </ul>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 text-white backdrop-blur">
              <p className="text-sm font-semibold text-indigo-200">Transfer summary</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-2xl font-semibold">{files.length}</p>
                  <p className="mt-1 text-xs text-slate-400">Files</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-2xl font-semibold">{formatBytes(totalSize)}</p>
                  <p className="mt-1 text-xs text-slate-400">Total size</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                {deliveryMode === 'email'
                  ? 'The recipient gets the transfer link by email as soon as the upload finishes.'
                  : 'You will get one short transfer link that you can copy and share anywhere.'}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 text-white backdrop-blur">
              <p className="text-sm font-semibold text-indigo-200">After upload</p>
              {done && completedShare && transferUrl ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <div>
                      <p className="font-semibold text-emerald-200">Transfer complete</p>
                      <p className="mt-1 text-sm text-emerald-100/80">
                        {completedShare.recipientEmail
                          ? `Email was sent to ${completedShare.recipientEmail}.`
                          : 'Your transfer link is ready to share.'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transfer link</p>
                    <p className="mt-2 break-all text-sm text-slate-100">{transferUrl}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={transferUrl}
                        target="_blank"
                        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyLink('transfer', transferUrl)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedLink === 'transfer' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-200">
                      {completedShare.pinProtected ? 'PIN protected' : 'No PIN'}
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-200">
                      Expires in 7 days
                    </span>
                  </div>

                  <div className="space-y-2">
                    {uploaded.slice(0, 3).map((item) => (
                      <div key={item.token} className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200">
                        <p className="truncate">{formatPath(item)}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatBytes(item.size)}</p>
                      </div>
                    ))}
                    {uploaded.length > 3 && (
                      <p className="text-sm text-slate-400">+{uploaded.length - 3} more files in this transfer.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-300">
                  When the upload finishes, the transfer link and delivery result will appear here.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {progressState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.2rem] bg-white px-5 py-7 text-center shadow-2xl sm:px-6 sm:py-8">
            <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[2rem] border-8 border-indigo-100 bg-indigo-50 sm:h-40 sm:w-40 sm:rounded-[2.5rem]">
              <div>
                <p className="text-4xl font-semibold text-indigo-600 sm:text-5xl">{progressState.percent}%</p>
              </div>
            </div>

            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950 sm:mt-8 sm:text-4xl">
              {progressState.phase === 'finishing' ? 'Almost done...' : progressState.phase === 'complete' ? 'Transfer complete' : 'Transferring...'}
            </h2>

            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              {progressState.fileCount === 1
                ? 'Sending 1 file'
                : `Sending ${progressState.fileCount} files`}
            </p>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">
              {formatUploadSize(progressState.uploadedBytes)} of {formatUploadSize(progressState.totalBytes)} uploaded
            </p>
            <p className="mt-3 truncate text-sm text-slate-400">
              {progressState.phase === 'finishing'
                ? 'Finalizing your transfer and sending notification'
                : progressState.currentFileName}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
