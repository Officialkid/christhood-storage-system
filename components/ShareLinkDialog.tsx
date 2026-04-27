'use client'

import { Sparkles, Link2, X } from 'lucide-react'

interface Props {
  linkType: 'FILE' | 'EVENT' | 'TRANSFER'
  fileId?: string
  eventId?: string
  subfolderId?: string
  transferId?: string
  defaultTitle: string
  onClose: () => void
}

export default function ShareLinkDialog({ defaultTitle, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/40">
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

        <div className="space-y-4 px-5 py-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            Product Update
          </div>

          <p className="text-base font-semibold text-white">ShareLink is currently unavailable</p>
          <p className="text-sm leading-relaxed text-slate-300">
            We are updating ShareLink for better reliability. Please use Transfers for now while this feature is being improved.
          </p>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
            Requested item: <span className="font-medium text-white">{defaultTitle || 'Selected item'}</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Okay
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
