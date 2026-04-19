'use client'

import React, {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { Check, CheckCircle2, Copy, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadResult = {
  name: string
  shareUrl: string
  token: string
  size: number
}

export type UploadMeta = {
  title: string
  message: string
  recipientEmail: string
  pin: string
}

export type UploadStatus = 'idle' | 'uploading' | 'confirming' | 'done' | 'error'

interface UploadState {
  status: UploadStatus
  files: File[]
  meta: UploadMeta
  currentIdx: number
  progress: Record<string, number>
  results: UploadResult[]
  errorMsg: string | null
  isNetworkError: boolean
  batchUrl: string | null
  emailSent: boolean
}

interface ShareUploadContextValue extends UploadState {
  startUpload: (files: File[], meta: UploadMeta) => void
  retry: () => void
  reset: () => void
  /** overall 0-100 progress across all files */
  overallProgress: number
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultMeta: UploadMeta = { title: '', message: '', recipientEmail: '', pin: '' }

const defaultState: UploadState = {
  status: 'idle',
  files: [],
  meta: defaultMeta,
  currentIdx: 0,
  progress: {},
  results: [],
  errorMsg: null,
  isNetworkError: false,
  batchUrl: null,
  emailSent: false,
}

// ── Context ───────────────────────────────────────────────────────────────────

const ShareUploadContext = createContext<ShareUploadContextValue>({
  ...defaultState,
  overallProgress: 0,
  startUpload: () => {},
  retry: () => {},
  reset: () => {},
})

export function useShareUpload() {
  return useContext(ShareUploadContext)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ShareUploadProvider({ children }: { children: React.ReactNode }) {
  const [state, setState]       = useState<UploadState>(defaultState)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const stateRef                = useRef(state)
  const xhrsRef                 = useRef<Set<XMLHttpRequest>>(new Set())
  // Background Fetch tracking
  const bgFetchCallbacks = useRef<Map<string, { resolve: () => void; reject: (e: Error) => void }>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgFetchRegs      = useRef<Map<string, any>>(new Map())
  const pathname                = usePathname()

  useEffect(() => { stateRef.current = state }, [state])

  // ── SW message listener (Background Fetch completion) ────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const handler = (ev: MessageEvent) => {
      const { type, token } = (ev.data ?? {}) as { type?: string; token?: string }
      if (type === 'SHARELINK_BG_COMPLETE' && token) {
        bgFetchCallbacks.current.get(token)?.resolve()
        bgFetchCallbacks.current.delete(token)
        bgFetchRegs.current.delete(token)
      }
      if (type === 'SHARELINK_BG_FAILED' && token) {
        bgFetchCallbacks.current.get(token)?.reject(
          Object.assign(new Error('Background upload failed — tap Retry'), { isNetwork: true })
        )
        bgFetchCallbacks.current.delete(token)
        bgFetchRegs.current.delete(token)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // ── Core upload engine ────────────────────────────────────────────────────

  const CONCURRENCY = 3

  // Helper: post a message to the registered service worker (non-fatal)
  function postSw(data: Record<string, unknown>) {
    try { navigator.serviceWorker?.controller?.postMessage(data) } catch { /* ignore */ }
  }

  const uploadFrom = useCallback(async (
    files: File[],
    meta: UploadMeta,
    existingResults: UploadResult[],
  ) => {
    const collected: UploadResult[] = [...existingResults]
    // Track completed files BY NAME so parallel out-of-order completion works correctly
    const doneNames = new Set(existingResults.map(r => r.name))

    setState(s => ({
      ...s,
      status:        'uploading',
      currentIdx:    existingResults.length,
      errorMsg:      null,
      isNetworkError: false,
    }))

    // Files not yet completed
    const pending = files.filter(f => !doneNames.has(f.name))
    let firstError: (Error & { isNetwork?: boolean }) | null = null

    // ── Upload a single file: presign → (BgFetch | XHR) → confirm ──────────────
    const processOne = async (file: File): Promise<void> => {
      // ── Step 1: presigned URL ──────────────────────────────────────────────
      const presignRes = await fetch('/api/public-share/presign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename:       file.name,
          mimeType:       file.type || 'application/octet-stream',
          fileSize:       file.size,
          title:          meta.title,
          message:        meta.message,
          recipientEmail: meta.recipientEmail,
          pin:            meta.pin,
        }),
      })

      if (!presignRes.ok) {
        const errData = await presignRes.json().catch(() => ({}))
        const err = new Error(errData.error ?? `Server error (${presignRes.status})`) as Error & { isNetwork?: boolean }
        err.isNetwork = false
        throw err
      }

      const { token, presignedUrl } = await presignRes.json()

      // ── Step 2a: Try Background Fetch API (OS-level, survives screen-off) ───
      let usedBgFetch = false
      try {
        const swReg = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? await navigator.serviceWorker.ready
          : null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (swReg && 'backgroundFetch' in swReg) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bgReg = await (swReg as any).backgroundFetch.fetch(
            `sl-${token}`,
            [new Request(presignedUrl, {
              method:  'PUT',
              body:    file,
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
            })],
            {
              title:         `Uploading ${file.name}`,
              downloadTotal: file.size,
              icons:         [{ src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }],
            },
          )
          bgFetchRegs.current.set(token, bgReg)
          usedBgFetch = true

          // Track upload progress from Background Fetch
          bgReg.addEventListener('progress', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = bgReg as any
            if (r.uploadTotal > 0) {
              const pct = Math.round(r.uploaded / r.uploadTotal * 100)
              setState(s => ({ ...s, progress: { ...s.progress, [file.name]: pct } }))
            }
          })

          // Await SW confirmation message
          await new Promise<void>((resolve, reject) => {
            bgFetchCallbacks.current.set(token, { resolve, reject })
          })
          // SW already called /confirm — skip step 3
        }
      } catch {
        usedBgFetch = false // fall through to XHR
      }

      // ── Step 2b: XHR fallback (when Background Fetch unavailable) ──────────
      if (!usedBgFetch) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrsRef.current.add(xhr)
          xhr.open('PUT', presignedUrl)
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

          xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
              setState(s => ({
                ...s,
                progress: { ...s.progress, [file.name]: Math.round((e.loaded / e.total) * 100) },
              }))
            }
          }

          xhr.onload = () => {
            xhrsRef.current.delete(xhr)
            if (xhr.status >= 200 && xhr.status < 300) {
              setState(s => ({ ...s, progress: { ...s.progress, [file.name]: 100 } }))
              resolve()
            } else {
              const err = new Error(`Upload failed (${xhr.status})`) as Error & { isNetwork?: boolean }
              err.isNetwork = false
              reject(err)
            }
          }

          xhr.onerror = () => {
            xhrsRef.current.delete(xhr)
            const err = new Error('Network error — check your connection and tap Retry') as Error & { isNetwork?: boolean }
            err.isNetwork = true
            reject(err)
          }

          xhr.ontimeout = () => {
            xhrsRef.current.delete(xhr)
            const err = new Error('Upload timed out — tap Retry to continue from where it stopped') as Error & { isNetwork?: boolean }
            err.isNetwork = true
            reject(err)
          }

          xhr.send(file)
        })

        // ── Step 3: confirm in the DB (XHR path only — BG Fetch path uses SW) ──
        const confirmRes = await fetch(`/api/public-share/${token}/confirm`, { method: 'POST' })
        if (!confirmRes.ok) {
          const err = new Error('Could not confirm upload. Please retry.') as Error & { isNetwork?: boolean }
          err.isNetwork = false
          throw err
        }
      }

      const shareUrl = `${window.location.origin}/public-share/${token}`
      const result: UploadResult = { name: file.name, shareUrl, token, size: file.size }
      collected.push(result)
      setState(s => ({ ...s, results: [...collected], currentIdx: collected.length - 1 }))

      // Post per-file progress to SW → shows in Android notification bar
      postSw({
        type:   'UPLOAD_PROGRESS',
        active: collected.length,
        total:  files.length,
        pct:    Math.round(collected.length / files.length * 100),
        tag:    'sharelink-upload',
      })
    }

    // ── Concurrency pool: up to CONCURRENCY workers drain the queue ────────
    const queue = [...pending]
    const runWorker = async () => {
      while (queue.length > 0 && !firstError) {
        const file = queue.shift()!
        try {
          await processOne(file)
        } catch (err) {
          if (!firstError) firstError = err as Error & { isNetwork?: boolean }
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, runWorker)
    )

    if (firstError) {
      postSw({
        type:       'UPLOAD_FAILED',
        failedCount: files.length - collected.length,
        tag:        'sharelink-upload',
      })
      setState(s => ({
        ...s,
        status:        'error',
        errorMsg:      firstError!.message ?? 'Upload failed. Please try again.',
        isNetworkError: firstError!.isNetwork === true,
      }))
      return
    }

    // ── All files done ────────────────────────────────────────────────────
    postSw({ type: 'UPLOAD_COMPLETE', total: collected.length, tag: 'sharelink-upload' })

    const batchUrl = collected.length > 1
      ? `${window.location.origin}/public-share/batch?tokens=${collected.map(r => r.token).join(',')}`
      : null

    setState(s => ({ ...s, status: 'confirming', batchUrl, results: collected }))
    setTimeout(() => setState(s => ({ ...s, status: 'done' })), 1400)

    // Email notification (non-fatal)
    if (meta.recipientEmail.trim() && collected.length > 0) {
      try {
        await fetch('/api/public-share/notify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: meta.recipientEmail.trim(),
            tokens:         collected.map(r => r.token),
            senderTitle:    meta.title,
          }),
        })
        setState(s => ({ ...s, emailSent: true }))
      } catch { /* non-fatal */ }
    }
  }, [])

  // ── Public actions ────────────────────────────────────────────────────────

  const startUpload = useCallback((files: File[], meta: UploadMeta) => {
    setState({ ...defaultState, files, meta })
    uploadFrom(files, meta, [])
  }, [uploadFrom])

  const retry = useCallback(() => {
    const s = stateRef.current
    if (s.status !== 'error') return
    // Resume: already-completed files are passed as existingResults; uncompleted ones will be retried
    setState(prev => ({ ...prev, status: 'uploading', errorMsg: null, isNetworkError: false }))
    uploadFrom(s.files, s.meta, s.results)
  }, [uploadFrom])

  const reset = useCallback(() => {
    xhrsRef.current.forEach(xhr => xhr.abort())
    xhrsRef.current.clear()
    // Abort any in-flight Background Fetch registrations
    bgFetchRegs.current.forEach((reg: any) => reg.abort?.().catch(() => {}))
    bgFetchRegs.current.clear()
    bgFetchCallbacks.current.clear()
    setState(defaultState)
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────

  const overallProgress = state.files.length === 0 ? 0
    : Math.round(
        Object.values(state.progress).reduce((acc, v) => acc + v, 0) / state.files.length
      )

  async function copyLink(url: string, idx: number) {
    await navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2500)
  }

  // ── Floating widget ───────────────────────────────────────────────────────
  // Visible when not idle AND the user has navigated away from /public-share
  const showFloating = state.status !== 'idle' && !pathname?.startsWith('/public-share')

  const CIRC = 2 * Math.PI * 26

  return (
    <ShareUploadContext.Provider value={{ ...state, overallProgress, startUpload, retry, reset }}>
      {children}

      {showFloating && (
        <div className={`fixed bottom-4 right-4 z-50 w-72 rounded-2xl shadow-2xl border backdrop-blur-sm transition-all duration-300 ${
          state.status === 'done'  ? 'bg-slate-900/95 border-emerald-500/40' :
          state.status === 'error' ? 'bg-slate-900/95 border-red-500/40'    :
                                     'bg-slate-900/95 border-indigo-500/40'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {state.status === 'done'       ? 'Transfer complete'  :
               state.status === 'confirming' ? 'Finishing up…'      :
               state.status === 'error'      ? 'Upload paused'      :
               `Uploading ${state.files.length} file${state.files.length !== 1 ? 's' : ''}`}
            </span>
            {(state.status === 'done' || state.status === 'error') && (
              <button onClick={reset} aria-label="Dismiss"
                      className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-4">
            {/* Uploading / confirming */}
            {(state.status === 'uploading' || state.status === 'confirming') && (
              <div className="flex items-center gap-3">
                <div className="relative shrink-0 w-14 h-14">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
                    <circle cx="30" cy="30" r="26" fill="none" stroke="rgb(30,41,59)" strokeWidth="5" />
                    <circle cx="30" cy="30" r="26" fill="none"
                      stroke={state.status === 'confirming' ? 'rgb(52,211,153)' : 'rgb(99,102,241)'}
                      strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={state.status === 'confirming' ? 0 : CIRC * (1 - overallProgress / 100)}
                      style={{ transition: 'stroke-dashoffset 0.4s ease-out, stroke 0.4s' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {state.status === 'confirming'
                      ? <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      : <span className="text-xs font-bold text-white tabular-nums">{overallProgress}%</span>
                    }
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {state.files.length > 1 && (
                    <p className="text-xs text-indigo-400 font-medium">
                      {state.results.length} of {state.files.length} done
                    </p>
                  )}
                  <p className="text-xs text-slate-400 truncate">{state.files[state.currentIdx]?.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">Running in background…</p>
                </div>
              </div>
            )}

            {/* Done */}
            {state.status === 'done' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <p className="text-sm text-white font-medium truncate">
                    {state.results.length === 1
                      ? state.results[0].name
                      : `${state.results.length} files ready`}
                  </p>
                </div>
                {state.results.length === 1 ? (
                  <button
                    onClick={() => copyLink(state.results[0].shareUrl, 0)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors"
                  >
                    {copiedIdx === 0
                      ? <><Check className="w-3.5 h-3.5" />Copied!</>
                      : <><Copy className="w-3.5 h-3.5" />Copy share link</>}
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    {state.results.map((r, i) => (
                      <div key={r.token} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-slate-400 truncate">{r.name}</span>
                        <button
                          onClick={() => copyLink(r.shareUrl, i)}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600/80 text-white text-xs hover:bg-indigo-600 transition-colors"
                        >
                          {copiedIdx === i ? <><Check className="w-3 h-3" />OK</> : <><Copy className="w-3 h-3" />Copy</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-600 text-center">
                  {state.results.map(r => formatBytes(r.size)).join(' · ')}
                </p>
              </div>
            )}

            {/* Error */}
            {state.status === 'error' && (
              <div className="space-y-3">
                <p className="text-xs text-red-400 leading-relaxed">{state.errorMsg}</p>
                {state.results.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {state.results.length} of {state.files.length} file{state.files.length !== 1 ? 's' : ''} already uploaded — retry will continue from where it stopped.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={retry}
                    className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors"
                  >
                    Retry upload
                  </button>
                  <button
                    onClick={reset}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-400 text-xs hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ShareUploadContext.Provider>
  )
}
