'use client'

import { useEffect, useState } from 'react'

// ── Minimal IndexedDB reader — same schema as lib/offlineQueue.ts ─────────────
// (Cannot import the lib directly from this static offline page)
const IDB_NAME  = 'cmms_offline_uploads'
const IDB_STORE = 'uploads'

interface PendingUpload {
  uid:          string
  originalName: string
  fileSize:     number
  addedAt:      string
}

function readPendingUploads(): Promise<PendingUpload[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve([]); return }
    const req = indexedDB.open(IDB_NAME, 1)
    req.onerror = () => resolve([])
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(IDB_STORE)) { resolve([]); return }
      const tx   = db.transaction(IDB_STORE, 'readonly')
      const all  = tx.objectStore(IDB_STORE).getAll()
      all.onsuccess = () => resolve(
        ((all.result ?? []) as PendingUpload[]).sort(
          (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
        )
      )
      all.onerror = () => resolve([])
    }
  })
}

function fmtSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OfflinePage() {
  const [pending,      setPending]      = useState<PendingUpload[]>([])
  const [showUploads,  setShowUploads]  = useState(false)
  const [nextRefresh,  setNextRefresh]  = useState(30)

  // Load pending uploads on mount
  useEffect(() => {
    readPendingUploads().then(setPending)
  }, [])

  // Auto-refresh every 30 s when connection is detected
  useEffect(() => {
    const tick = setInterval(() => {
      setNextRefresh(n => {
        if (n <= 1) {
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            window.location.replace(window.location.href)
          }
          return 30
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  // Also reload immediately on the `online` event
  useEffect(() => {
    const handler = () => window.location.replace('/dashboard')
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [])

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-8">

          {/* Logo + brand */}
          <div className="flex flex-col items-center gap-4 text-center">
            {/* App icon */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192.svg"
              alt="Christhood CMMS"
              className="w-20 h-20 rounded-3xl shadow-lg"
            />
            <div>
              <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">
                Christhood CMMS
              </p>
              <h1 className="text-2xl font-bold text-white leading-tight">
                You're offline right now
              </h1>
            </div>
          </div>

          {/* Status card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            {/* Upload queue status */}
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5" aria-hidden>📤</span>
              <div>
                <p className="text-sm font-medium text-white">
                  {pending.length > 0
                    ? `${pending.length} upload${pending.length !== 1 ? 's' : ''} waiting`
                    : 'No pending uploads'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Your uploads are saved and will send when you reconnect
                </p>
              </div>
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <p className="text-xs text-slate-500">
                Checking for connection in {nextRefresh}s…
              </p>
            </div>
          </div>

          {/* Pending uploads list (expandable) */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowUploads(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3
                           bg-slate-900 border border-slate-800 rounded-xl
                           text-sm font-medium text-white hover:bg-slate-800 transition"
              >
                <span>View pending uploads ({pending.length})</span>
                <span className="text-slate-500 text-xs">
                  {showUploads ? '▲ Hide' : '▼ Show'}
                </span>
              </button>

              {showUploads && (
                <ul className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                  {pending.map((item) => (
                    <li key={item.uid} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-base" aria-hidden>🗂️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{item.originalName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{fmtSize(item.fileSize)}</p>
                      </div>
                      <span className="text-xs text-amber-500 shrink-0 font-medium">Queued</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         text-white text-sm font-semibold transition"
            >
              Try again now
            </button>
            <a
              href="/dashboard"
              className="w-full py-3 rounded-xl border border-slate-700 hover:border-slate-600
                         text-slate-300 hover:text-white text-sm font-medium text-center transition"
            >
              Go to Dashboard
            </a>
          </div>

        </div>
      </body>
    </html>
  )
}
