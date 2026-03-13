'use client'

import { useState }          from 'react'
import { useRouter }         from 'next/navigation'
import { Trash2 }            from 'lucide-react'
import type { AppRole }      from '@/types'
import { DeleteFileDialog }  from '@/components/DeleteFileDialog'

interface Props {
  fileId:        string
  fileName:      string
  fileStatus:    string
  uploaderId:    string
  thumbnailUrl?: string | null
  userRole:      AppRole
  currentUserId: string
}

export function DeleteFileButton({
  fileId, fileName, fileStatus, uploaderId, thumbnailUrl, userRole, currentUserId,
}: Props) {
  const router     = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                   text-red-400 border border-red-800/50 hover:bg-red-950/30 transition"
      >
        <Trash2 className="w-4 h-4" />
        Move to Trash
      </button>

      {open && (
        <DeleteFileDialog
          files={[{ id: fileId, originalName: fileName, status: fileStatus, uploaderId, thumbnailUrl }]}
          userRole={userRole}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false)
            router.push('/media')
          }}
        />
      )}
    </>
  )
}
