'use client'

/**
 * VersionUploadPanel
 * Lets EDITOR / ADMIN upload a new version of an existing file.
 * Two-step: call /prepare → upload to R2 → call /confirm.
 */

import { useState, useRef } from 'react'
import type { AppRole } from '@/types'

interface Props {
  fileId:             string
  originalName:       string
  userRole:           AppRole
  /** Called with the new version number once the upload is fully confirmed */
  onVersionUploaded?: (newVersionNumber: number) => void
}

export function VersionUploadPanel({ fileId, originalName, userRole, onVersionUploaded }: Props) {
  const [file,     setFile]     = useState<File | null>(null)
  const [phase,    setPhase]    = useState<'idle' | 'uploading' | 'confirming' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState<string | null>(null)
  const [newVer,   setNewVer]   = useState<number | null>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  if (userRole === 'UPLOADER') return null

  async function handleUpload() {
    if (!file) return
    setPhase('uploading')
    setProgress(0)
    setError(null)

    try {
      // Step 1 — prepare: get presigned URL + r2Key from server
      const prepareRes = await fetch(`/api/media/${fileId}/versions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          filename:    file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize:    file.size,
        }),
      })
      if (!prepareRes.ok) {
        const msg = (await prepareRes.json().catch(() => ({}))).error ?? 'Prepare failed'
        throw new Error(msg)
      }
      const { uploadUrl, r2Key, nextVersion, storedName } = await prepareRes.json()

      // Step 2 — upload directly to R2 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`R2 HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      // Step 3 — confirm: tell the server to create the FileVersion record
      setPhase('confirming')
      const confirmRes = await fetch(`/api/media/${fileId}/versions/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          r2Key,
          nextVersion,
          storedName,
          originalName: file.name,
          fileSize:     file.size,
        }),
      })
      if (!confirmRes.ok) {
        const msg = (await confirmRes.json().catch(() => ({}))).error ?? 'Confirm failed'
        throw new Error(msg)
      }

      setNewVer(nextVersion)
      setPhase('done')
      onVersionUploaded?.(nextVersion)
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setPhase('idle')
    setProgress(0)
    setError(null)
    setNewVer(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
        Upload New Version
      </h2>

      {phase === 'done' ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-emerald-400">
            Version {newVer} uploaded successfully.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300
                       hover:bg-slate-600 transition-colors"
          >
            Upload another
          </button>
        </div>
      ) : (
        <>
          {/* Drop / select area */}
          <div
            onClick={() => phase === 'idle' && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const dropped = e.dataTransfer.files[0]
              if (dropped && phase === 'idle') setFile(dropped)
            }}
            className={`cursor-pointer rounded-lg border-2 border-dashed transition-colors
                        flex flex-col items-center justify-center py-8 gap-2 text-center
                        ${phase !== 'idle'
                          ? 'border-slate-700 opacity-50 cursor-not-allowed'
                          : file
                            ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                            : 'border-slate-700 hover:border-indigo-500 text-slate-500 hover:text-slate-300'
                        }`}
          >
            <span className="text-2xl">{file ? '📄' : '📁'}</span>
            {file ? (
              <>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB — replacing <em>{originalName}</em>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Drag & drop a new version here</p>
                <p className="text-xs">or click to browse</p>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]) }}
          />

          {/* Progress bar */}
          {(phase === 'uploading' || phase === 'confirming') && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{phase === 'confirming' ? 'Saving version record…' : 'Uploading…'}</span>
                {phase === 'uploading' && <span>{progress}%</span>}
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500
                              transition-all duration-200"
                  style={{ width: phase === 'confirming' ? '100%' : `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              disabled={!file || phase !== 'idle'}
              onClick={handleUpload}
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2
                         text-sm font-semibold text-white transition-opacity
                         disabled:opacity-40 disabled:cursor-not-allowed
                         hover:opacity-90"
            >
              {phase === 'uploading'  ? 'Uploading…'  :
               phase === 'confirming' ? 'Saving…'     : 'Upload version'}
            </button>

            {file && phase === 'idle' && (
              <button
                onClick={reset}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-300
                           hover:bg-slate-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
