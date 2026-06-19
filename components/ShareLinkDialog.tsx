'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Loader2, Sparkles, X } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/ui/Button'

interface Props {
  linkType: 'FILE' | 'EVENT' | 'TRANSFER'
  fileId?: string
  eventId?: string
  subfolderId?: string
  transferId?: string
  defaultTitle: string
  onClose: () => void
}

type CreateResponse = {
  id: string
  token: string
  url: string
  expiresAt: string
  hasPin: boolean
}

const EXPIRY_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
  { value: 720, label: '30 days' },
]

export default function ShareLinkDialog({
  linkType,
  fileId,
  eventId,
  subfolderId,
  transferId,
  defaultTitle,
  onClose,
}: Props) {
  const toast = useToast()
  const [title, setTitle] = useState(defaultTitle)
  const [message, setMessage] = useState('')
  const [pinEnabled, setPinEnabled] = useState(false)
  const [pin, setPin] = useState('')
  const [limitEnabled, setLimitEnabled] = useState(false)
  const [maxDownloads, setMaxDownloads] = useState('10')
  const [expiresInHours, setExpiresInHours] = useState(168)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const targetLabel = useMemo(() => {
    if (linkType === 'FILE') return 'single file'
    if (linkType === 'EVENT') return subfolderId ? 'event folder' : 'full event'
    return 'transfer package'
  }, [linkType, subfolderId])

  async function handleCreate() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please enter a title for this share link.')
      return
    }
    if (trimmedTitle.length > 120) {
      setError('Title must be 120 characters or less.')
      return
    }
    if (message.length > 500) {
      setError('Message must be 500 characters or less.')
      return
    }
    if (pinEnabled && !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    if (limitEnabled) {
      const count = Number(maxDownloads)
      if (!Number.isInteger(count) || count < 1) {
        setError('Maximum downloads must be a positive whole number.')
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkType,
          fileId,
          eventId,
          subfolderId,
          transferId,
          title: trimmedTitle,
          message: message.trim() || null,
          pin: pinEnabled ? pin : null,
          maxDownloads: limitEnabled ? Number(maxDownloads) : null,
          expiresInHours,
        }),
      })

      const data = await res.json().catch(() => ({})) as Partial<CreateResponse> & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create share link.')
        return
      }

      setCreated(data as CreateResponse)
      toast.success('Share link created.')
    } catch {
      setError('Network error while creating the share link. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!created?.url) return
    const ok = await navigator.clipboard.writeText(created.url).then(() => true).catch(() => false)
    if (!ok) {
      toast.error('Could not copy the share link.')
      return
    }
    setCopied(true)
    toast.success('Share link copied.')
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-300" />
            <h2 className="text-sm font-semibold tracking-wide text-white">Share Link</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {!created ? (
            <>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                External sharing restored
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3">
                <p className="text-sm font-medium text-white">{defaultTitle || 'Selected item'}</p>
                <p className="mt-1 text-xs text-slate-400">
                  This link will share a {targetLabel} through a secure public URL for external recipients.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Link title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    placeholder="What should recipients see?"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Message (optional)</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    placeholder="Add a note for the recipient"
                  />
                  <p className="mt-1 text-right text-xs text-slate-500">{message.length}/500</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Expiry</label>
                    <select
                      value={expiresInHours}
                      onChange={(e) => setExpiresInHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {EXPIRY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Download limit</label>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-400">
                        <input
                          type="checkbox"
                          checked={limitEnabled}
                          onChange={(e) => setLimitEnabled(e.target.checked)}
                          className="accent-indigo-500"
                        />
                        Limit downloads
                      </label>
                      {limitEnabled && (
                        <input
                          type="number"
                          min={1}
                          value={maxDownloads}
                          onChange={(e) => setMaxDownloads(e.target.value)}
                          className="w-24 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={pinEnabled}
                      onChange={(e) => setPinEnabled(e.target.checked)}
                      className="accent-indigo-500"
                    />
                    Protect with 4-digit PIN
                  </label>
                  {pinEnabled && (
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      inputMode="numeric"
                      placeholder="0000"
                      className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm tracking-[0.35em] text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  )}
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="button" variant="primary" onClick={handleCreate} disabled={saving}>
                  {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating…</span> : 'Create link'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <Check className="h-4 w-4" />
                  Share link ready
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  This link is live and will expire on {new Date(created.expiresAt).toLocaleString()}.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Public URL</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={created.url}
                      className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 focus:outline-none"
                    />
                    <Button type="button" variant="secondary" onClick={handleCopy}>
                      {copied ? <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Copied</span> : <span className="inline-flex items-center gap-2"><Copy className="h-4 w-4" /> Copy</span>}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
                  <p>Recipients can open the link and download directly.</p>
                  {created.hasPin && <p className="mt-1 text-amber-300">Remember to send them the 4-digit PIN separately.</p>}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={onClose}>Done</Button>
                <a
                  href={created.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
