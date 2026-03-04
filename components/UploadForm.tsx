'use client'

import { useState, useRef } from 'react'

interface Props {
  events: { id: string; name: string }[]
}

type FileState = {
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

export function UploadForm({ events }: Props) {
  const [files,   setFiles]   = useState<FileState[]>([])
  const [eventId, setEventId] = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    const picked = Array.from(e.target.files).map<FileState>((f) => ({
      file: f, status: 'pending', progress: 0
    }))
    setFiles((prev) => [...prev, ...picked])
  }

  async function uploadAll() {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue
      await uploadOne(i)
    }
  }

  async function uploadOne(index: number) {
    const { file } = files[index]
    setFiles((prev) =>
      prev.map((f, i) => i === index ? { ...f, status: 'uploading', progress: 0 } : f)
    )

    try {
      // 1. Get presigned URL
      const res  = await fetch('/api/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          filename:    file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes:   file.size,
          ...(eventId ? { eventId } : {})
        })
      })

      if (!res.ok) throw new Error(await res.text())
      const { uploadUrl, mediaId } = await res.json()

      // 2. Upload directly to R2 via presigned URL (XMLHttpRequest for progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setFiles((prev) =>
              prev.map((f, i) =>
                i === index ? { ...f, progress: Math.round((e.loaded / e.total) * 100) } : f
              )
            )
          }
        }
        xhr.onload  = () => (xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      // 3. Mark media record as READY
      await fetch('/api/media', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: mediaId, status: 'READY' })
      })

      setFiles((prev) =>
        prev.map((f, i) => i === index ? { ...f, status: 'done', progress: 100 } : f)
      )
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f, i) => i === index ? { ...f, status: 'error', error: err.message } : f)
      )
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length

  return (
    <div className="rounded-2xl bg-slate-800 border border-slate-700 p-6 space-y-6">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dropped = Array.from(e.dataTransfer.files).map<FileState>((f) => ({
            file: f, status: 'pending', progress: 0
          }))
          setFiles((prev) => [...prev, ...dropped])
        }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-slate-600
                   hover:border-indigo-500 transition-colors flex flex-col items-center
                   justify-center py-12 gap-3 text-slate-400 hover:text-slate-200"
      >
        <span className="text-4xl">📁</span>
        <p className="text-sm font-medium">Drag & drop files here, or click to browse</p>
        <p className="text-xs text-slate-500">Photos (JPEG, PNG, RAW) or Videos (MP4, MOV)</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Event selector */}
      {events.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Link to Event <span className="text-slate-500">(optional)</span>
          </label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-white border border-slate-600
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— No event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-4 py-2">
              <span className="text-lg shrink-0">
                {f.file.type.startsWith('video/') ? '🎬' : '🖼️'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{f.file.name}</p>
                {f.status === 'uploading' && (
                  <div className="mt-1 h-1.5 w-full bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.status === 'error' && (
                  <p className="text-xs text-red-400 mt-0.5">{f.error}</p>
                )}
              </div>
              <span className={`text-xs shrink-0 font-medium
                ${f.status === 'done'     ? 'text-green-400' :
                  f.status === 'error'    ? 'text-red-400'   :
                  f.status === 'uploading'? 'text-indigo-400':
                                            'text-slate-400'}`}>
                {f.status === 'uploading' ? `${f.progress}%` :
                 f.status === 'done'      ? '✓ Done'         :
                 f.status === 'error'     ? '✗ Failed'       : 'Queued'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Upload button */}
      <button
        onClick={uploadAll}
        disabled={pendingCount === 0}
        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                   disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white
                   transition-colors"
      >
        {pendingCount > 0 ? `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}` : 'All uploaded'}
      </button>
    </div>
  )
}
