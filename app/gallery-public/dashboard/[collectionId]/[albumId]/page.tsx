'use client'

import { useState, useCallback, useRef, use } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import type { PhotoItem } from '@prisma/client'

interface AlbumData {
  album: {
    id:            string
    title:         string
    description:   string | null
    allowDownload: boolean
    visibility:    string
    collectionId:  string
    photoCount:    number
    items: (Omit<PhotoItem, 'fileSizeBytes'> & {
      thumbnailKey: string
      thumbnailUrl: string
      previewUrl:   string
      originalUrl:  string | null
    })[]
    _count: { shareTokens: number }
  }
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function AlbumEditorPage({
  params,
}: {
  params: Promise<{ collectionId: string; albumId: string }>
}) {
  const resolvedParams = use(params)
  const { collectionId, albumId } = resolvedParams

  const { data, isLoading, mutate } = useSWR<AlbumData>(`/api/photo/albums/${albumId}`, fetcher)

  const [uploading, setUploading]   = useState(false)
  const [uploadMsg, setUploadMsg]   = useState('')
  const [lightbox, setLightbox]     = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const album = data?.album

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    if (!arr.length) return
    setUploading(true)
    setUploadMsg(`Uploading 0 of ${arr.length}…`)
    let done = 0
    for (const file of arr) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        await fetch(`/api/photo/albums/${albumId}/upload`, { method: 'POST', body: fd })
        done++
        setUploadMsg(`Uploading ${done} of ${arr.length}…`)
      } catch {
        setUploadMsg(`Error uploading ${file.name}`)
      }
    }
    setUploading(false)
    setUploadMsg('')
    mutate()
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }, [albumId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <LoadingScreen />
  if (!album) return <div className="p-8 text-zinc-400 text-sm">Album not found.</div>

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/dashboard/${collectionId}`}
          className="text-sm text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          ← Back
        </Link>
        <h1 className="text-base font-semibold truncate flex-1">{album.title}</h1>
        <div className="flex items-center gap-2">
          <ShareButton albumId={album.id} shareCount={album._count.shareTokens} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="rounded-xl border-2 border-dashed border-zinc-700 hover:border-zinc-500
                     transition-colors p-10 text-center cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          aria-label="Upload photos"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
          {uploading ? (
            <p className="text-sm text-zinc-300 animate-pulse">{uploadMsg}</p>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Drag and drop photos here or <span className="text-white underline">browse</span>
              </p>
              <p className="text-xs text-zinc-600 mt-1">JPEG, PNG, WebP, GIF · max 50 MB each</p>
            </>
          )}
        </div>

        {/* Photo grid */}
        {album.items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {album.items.map(item => (
              <div key={item.id} className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl}
                  alt={item.caption ?? item.originalName}
                  className="w-full h-full object-cover cursor-pointer group-hover:opacity-80 transition"
                  onClick={() => setLightbox(item.previewUrl)}
                />
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition">
                  <DeleteItemButton itemId={item.id} onDeleted={() => mutate()} />
                </div>
                {/* Set as cover button */}
                <button
                  onClick={() => setAlbumCover(albumId, item.thumbnailKey ?? '', mutate)}
                  className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition
                             rounded bg-black/70 text-xs text-white px-2 py-1 hover:bg-black/90"
                >
                  Set cover
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-zinc-600 text-sm">
            No photos yet — upload some above.
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ShareButton({ albumId, shareCount }: { albumId: string; shareCount: number }) {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<{ id: string; token: string; label: string | null; allowDownload: boolean }[]>([])
  const [creating, setCreating] = useState(false)

  async function loadTokens() {
    const res = await fetch(`/api/photo/albums/${albumId}/share`)
    const data = await res.json()
    setTokens(data.tokens ?? [])
    setOpen(true)
  }

  async function createToken() {
    setCreating(true)
    const res = await fetch(`/api/photo/albums/${albumId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Share link', allowDownload: true }),
    })
    const data = await res.json()
    setTokens(prev => [data.shareToken, ...prev])
    setCreating(false)
  }

  const base = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <>
      <button
        onClick={loadTokens}
        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500 transition-colors"
      >
        Share · {shareCount}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Share links</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white text-lg">×</button>
            </div>
            <button
              onClick={createToken}
              disabled={creating}
              className="w-full rounded-lg bg-white text-black text-sm font-semibold py-2
                         hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {creating ? 'Creating…' : '+ Create link'}
            </button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2">
                  <span className="flex-1 text-xs text-zinc-300 truncate font-mono">
                    {base}/s/{t.token}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${base}/s/${t.token}`)}
                    className="text-xs text-zinc-400 hover:text-white shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ))}
              {tokens.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-2">No links yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DeleteItemButton({ itemId, onDeleted }: { itemId: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  async function handleDelete() {
    if (!confirm('Delete this photo?')) return
    setBusy(true)
    await fetch(`/api/photo/items/${itemId}`, { method: 'DELETE' })
    onDeleted()
    setBusy(false)
  }
  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="rounded bg-black/80 text-xs text-white p-1.5 hover:bg-red-900/80 transition"
      aria-label="Delete photo"
    >
      {busy ? '…' : '✕'}
    </button>
  )
}

async function setAlbumCover(albumId: string, coverKey: string, mutate: () => void) {
  await fetch(`/api/photo/albums/${albumId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ coverKey }),
  })
  mutate()
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
    </div>
  )
}
