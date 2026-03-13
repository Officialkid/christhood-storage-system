'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import ShareLinkDialog from './ShareLinkDialog'

interface Props {
  linkType:     'FILE' | 'EVENT' | 'TRANSFER'
  fileId?:      string
  eventId?:     string
  subfolderId?: string
  transferId?:  string
  defaultTitle: string
}

export default function ShareButton(props: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700
                   border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white
                   text-sm font-medium transition"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>

      {open && (
        <ShareLinkDialog
          {...props}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
