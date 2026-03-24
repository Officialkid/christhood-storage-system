'use client'

import { useState, useCallback, useEffect } from 'react'
import { Share2, X, Copy, Check, Loader2, Lock, RefreshCw, Link as LinkIcon } from 'lucide-react'

interface Props {
  linkType:     'FILE' | 'EVENT' | 'TRANSFER'
  fileId?:      string
  eventId?:     string
  subfolderId?: string
  transferId?:  string
  defaultTitle: string
  onClose:      () => void
}

const DURATION_OPTIONS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days',   hours: 168 },
  { label: '30 days',  hours: 720 },
] as const

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function humanExpiry(hours: number): string {
  if (hours < 24) return `in ${hours} hour${hours !== 1 ? 's' : ''}`
  const days = Math.round(hours / 24)
  return `in ${days} day${days !== 1 ? 's' : ''}`
}

export default function ShareLinkDialog({
  linkType, fileId, eventId, subfolderId, transferId, defaultTitle, onClose
}: Props) {
  const [title,        setTitle]        = useState(defaultTitle.slice(0, 120))
  const [message,      setMessage]      = useState('')
  const [expiryMode,   setExpiryMode]   = useState<number | 'custom'>(168)   // hours or 'custom'
  const [customHours,  setCustomHours]  = useState('')
  const [enablePin,    setEnablePin]    = useState(false)
  const [pin,          setPin]          = useState(generatePin)
  const [maxEnabled,   setMaxEnabled]   = useState(false)
  const [maxDownloads, setMaxDownloads] = useState('')
  const [generating,    setGenerating]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [result,        setResult]        = useState<{ url: string; pin?: string; expiresAt: string } | null>(null)
  const [copied,        setCopied]        = useState(false)
  const [supportsShare, setSupportsShare] = useState(false)

  useEffect(() => { setSupportsShare(!!navigator.share) }, [])

  const effectiveHours = expiryMode === 'custom'
    ? Math.max(1, Math.min(8760, Number(customHours) || 24))
    : expiryMode

  const handleGenerate = useCallback(async () => {
    setError(null)
    setGenerating(true)
    try {
      const body: Record<string, unknown> = {
        linkType, title, expiresInHours: effectiveHours,
        ...(message                         && { message }),
        ...(fileId                           && { fileId }),
        ...(eventId                          && { eventId }),
        ...(subfolderId                      && { subfolderId }),
        ...(transferId                       && { transferId }),
        ...(enablePin                        && { pin }),
        ...(maxEnabled && maxDownloads       && { maxDownloads: Number(maxDownloads) }),
      }
      const res = await fetch('/api/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json() as { url?: string; expiresAt?: string; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to generate link.'); return }
      setResult({ url: data.url!, expiresAt: data.expiresAt!, pin: enablePin ? pin : undefined })
    } catch {
      setError('Network error — please check your connection.')
    } finally {
      setGenerating(false)
    }
  }, [linkType, title, message, effectiveHours, fileId, eventId, subfolderId, transferId, enablePin, pin, maxEnabled, maxDownloads])

  async function copyUrl() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShare() {
    if (!result) return
    const shareData = {
      title: defaultTitle,
      text:  `Here is a shared link from the Christhood CMMS: ${defaultTitle}`,
      url:   result.url,
    }
    try {
      await navigator.share(shareData)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await copyUrl()
      }
    }
  }

  // ─── Result screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <DialogShell onClose={onClose} title="Link created">
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-start gap-3">
            <LinkIcon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300 leading-relaxed break-all">{result.url}</p>
          </div>

          <div className="flex gap-2">
            {supportsShare && (
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
              >
                <Share2 className="w-4 h-4" />
                Share ↗
              </button>
            )}
            <button
              onClick={copyUrl}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          {result.pin && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-xs text-amber-300 font-medium mb-0.5">PIN code — share this with the recipient</p>
              <p className="text-2xl font-mono font-bold tracking-widest text-amber-200">{result.pin}</p>
              <p className="text-xs text-amber-400/60 mt-1">Required to access the files.</p>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            Expires {humanExpiry(effectiveHours)} · {result.url.includes('/share/') ? 'External access — no login required' : ''}
          </p>

          <button onClick={onClose}
            className="w-full py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white
                       hover:border-slate-600 text-sm transition"
          >
            Done
          </button>
        </div>
      </DialogShell>
    )
  }

  // ─── Form screen ─────────────────────────────────────────────────────────
  return (
    <DialogShell onClose={onClose} title="Create share link">
      <div className="space-y-4">

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Title <span className="text-red-400">*</span></label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 120))}
            maxLength={120}
            className="w-full rounded-xl bg-slate-700/50 border border-slate-600 px-3 py-2 text-sm
                       text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            placeholder="e.g. Q3 Event Photos"
          />
          <p className="text-right text-xs text-slate-600 mt-0.5">{title.length}/120</p>
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Message (optional)</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={2}
            className="w-full rounded-xl bg-slate-700/50 border border-slate-600 px-3 py-2 text-sm
                       text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Optional note for whoever opens this link…"
          />
          <p className="text-right text-xs text-slate-600 mt-0.5">{message.length}/500</p>
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Expires</label>
          <div className="flex gap-2 flex-wrap">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => { setExpiryMode(opt.hours) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition
                  ${expiryMode === opt.hours
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                    : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'}`}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExpiryMode('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition
                ${expiryMode === 'custom'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500'}`}
            >
              Custom
            </button>
          </div>
          {expiryMode === 'custom' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1} max={8760}
                value={customHours}
                onChange={e => setCustomHours(e.target.value)}
                placeholder="e.g. 48"
                className="w-24 rounded-xl bg-slate-700/50 border border-slate-600 px-3 py-1.5 text-sm
                           text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-xs text-slate-500">hours</span>
            </div>
          )}
        </div>

        {/* PIN toggle */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-700/30 border border-slate-700/50">
          <input
            type="checkbox"
            id="enable-pin"
            checked={enablePin}
            onChange={e => setEnablePin(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-500 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <label htmlFor="enable-pin" className="flex items-center gap-2 text-sm font-medium text-slate-300 cursor-pointer">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Require PIN to access
            </label>
            {enablePin && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl font-mono font-bold tracking-widest text-amber-200">{pin}</span>
                <button
                  type="button"
                  onClick={() => setPin(generatePin())}
                  title="Regenerate PIN"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-0.5">You'll need to share this PIN separately with the recipient.</p>
          </div>
        </div>

        {/* Max downloads toggle */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-700/30 border border-slate-700/50">
          <input
            type="checkbox"
            id="max-dl"
            checked={maxEnabled}
            onChange={e => setMaxEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-500 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <label htmlFor="max-dl" className="text-sm font-medium text-slate-300 cursor-pointer block">
              Limit total downloads
            </label>
            {maxEnabled && (
              <input
                type="number"
                min={1}
                value={maxDownloads}
                onChange={e => setMaxDownloads(e.target.value)}
                placeholder="e.g. 10"
                className="mt-2 w-24 rounded-xl bg-slate-700/50 border border-slate-600 px-3 py-1.5 text-sm
                           text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            )}
            <p className="text-xs text-slate-500 mt-0.5">Link deactivates after this many file downloads.</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white
                       hover:border-slate-600 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !title.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                       text-white text-sm font-medium transition"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Generate link
          </button>
        </div>
      </div>
    </DialogShell>
  )
}

// ─── Dialog shell ─────────────────────────────────────────────────────────────

function DialogShell({ children, title, onClose }: {
  children: React.ReactNode; title: string; onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-indigo-400" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
