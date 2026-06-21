'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type TransferFile = {
  token: string
  originalName: string
  folderPath: string | null
  fileSize: string
  mimeType: string
  downloadCount: number
}

type TransferMeta = {
  transferToken: string | null
  transferCode: string | null
  bundleName: string
  title: string | null
  message: string | null
  expiresAt: string
  createdAt: string
  totalSize: number
  downloadCount: number
  pinRequired: boolean
  files: TransferFile[]
}

type Step = 'loading' | 'pin' | 'ready' | 'downloading' | 'notfound' | 'error'

function formatBytes(bytes: string | number): string {
  const value = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
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

function fullName(file: TransferFile): string {
  return file.folderPath ? `${file.folderPath}/${file.originalName}` : file.originalName
}

export default function TransferShareViewClient({ code }: { code: string }) {
  const [step, setStep] = useState<Step>('loading')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [transfer, setTransfer] = useState<TransferMeta | null>(null)

  const loadTransfer = useCallback(async (pinValue?: string) => {
    const url = `/api/public-share/transfers/${code}${pinValue ? `?pin=${encodeURIComponent(pinValue)}` : ''}`
    const res = await fetch(url)

    if (res.status === 404) {
      setStep('notfound')
      return
    }

    if (res.status === 401) {
      setPinError('')
      setStep('pin')
      return
    }

    if (res.status === 403) {
      setPinError('Incorrect PIN. Please try again.')
      setStep('pin')
      return
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? `Could not load this transfer (${res.status}).`)
      setStep('error')
      return
    }

    const body = await res.json() as TransferMeta
    setTransfer(body)
    setPinError('')
    setStep('ready')
  }, [code])

  useEffect(() => {
    void loadTransfer()
  }, [loadTransfer])

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,8}$/.test(pin)) {
      setPinError('PIN must be 4-8 digits.')
      return
    }
    setStep('loading')
    void loadTransfer(pin)
  }

  const handleDownload = () => {
    setStep('downloading')
    const query = pin ? `?pin=${encodeURIComponent(pin)}` : ''
    window.location.href = `/api/public-share/transfers/${code}/download${query}`
    window.setTimeout(() => {
      setStep('ready')
    }, 3000)
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center px-4">
        <div className="w-8 h-8 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'notfound') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold text-white">Transfer not found</h1>
          <p className="mt-3 text-sm text-slate-400">
            This transfer may have expired or been removed.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Christhood ShareLink</p>
            <h1 className="mt-3 text-2xl font-bold text-white">Transfer locked</h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter the correct PIN once and then you can download the full transfer.
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="mt-6 space-y-3">
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                maxLength={8}
                placeholder="4-8 digit PIN"
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 pr-12 text-center tracking-[0.25em] text-lg text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-white"
              >
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>

            {pinError && <p className="text-center text-sm text-red-400">{pinError}</p>}

            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Unlock transfer
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'error' || !transfer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="mt-3 text-sm text-red-400">{error || 'Please try again.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Christhood ShareLink</p>
            <h1 className="text-xl font-bold text-white">Transfer ready to download</h1>
          </div>
          <Link href="/public-share" className="text-sm text-slate-400 transition hover:text-white">
            Send files
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:gap-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-300">
                  {transfer.title || transfer.bundleName}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  {transfer.files.length} file{transfer.files.length !== 1 ? 's' : ''} in one transfer
                </h2>
                {transfer.message && (
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{transfer.message}</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left sm:min-w-[15rem] sm:text-right">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Download package</p>
                <p className="mt-1 break-words text-base font-semibold text-white sm:text-lg">{transfer.bundleName}.zip</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Size</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatBytes(transfer.totalSize)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Expires</p>
                <p className="mt-1 text-sm font-semibold text-white">{expiryCountdown(transfer.expiresAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Security</p>
                <p className="mt-1 text-sm font-semibold text-white">{transfer.pinRequired ? 'PIN protected' : 'Open link'}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
              <p className="text-sm leading-6 text-indigo-100">
                Download once and you will receive everything together in a single ZIP folder named after this transfer. If the sender uploaded a folder, its structure is kept inside the download.
              </p>
            </div>

            <div className="mt-6">
              <button
                onClick={handleDownload}
                disabled={step === 'downloading'}
                className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {step === 'downloading' ? 'Preparing download...' : `Download ${transfer.files.length} files together`}
              </button>
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-white">What is inside</h3>
            <div className="mt-4 max-h-[24rem] space-y-2 overflow-auto sm:max-h-[32rem]">
              {transfer.files.map((file) => (
                <div key={file.token} className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <p className="truncate text-sm font-medium text-white">{fullName(file)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatBytes(file.fileSize)}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
