'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface TokenAlbum {
  id:          string
  title:       string
  description: string | null
  coverUrl:    string | null
  photoCount:  number
  allowDownload: boolean
  collection: {
    title: string
    slug:  string
    owner: { username: string; displayName: string; avatarUrl: string | null }
  }
  items: {
    id:           string
    caption:      string | null
    width:        number | null
    height:       number | null
    thumbnailUrl: string
    previewUrl:   string
    originalUrl:  string | null
    sortOrder:    number
  }[]
}

type ViewState =
  | { type: 'loading' }
  | { type: 'requires_password'; albumTitle: string }
  | { type: 'loaded'; album: TokenAlbum; tokenMeta: { label: string | null; allowDownload: boolean; expiresAt: string | null } }
  | { type: 'error'; message: string }

export default function ShareTokenPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<ViewState>({ type: 'loading' })
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [checking, setChecking] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    loadAlbum()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAlbum() {
    setState({ type: 'loading' })
    const res  = await fetch(`/api/photo/s/${token}`)
    const data = await res.json()
    if (res.status === 404 || res.status === 410) {
      setState({ type: 'error', message: data.error })
      return
    }
    if (data.requiresPassword) {
      setState({ type: 'requires_password', albumTitle: data.albumTitle })
      return
    }
    setState({ type: 'loaded', album: data.album, tokenMeta: data.token })
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    setChecking(true)
    const res  = await fetch(`/api/photo/s/${token}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    })
    const data = await res.json()
    setChecking(false)
    if (!res.ok) {
      setPwError(data.error ?? 'Incorrect password.')
      return
    }
    // Password accepted — cookie set, reload album data
    loadAlbum()
  }

  if (state.type === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (state.type === 'error') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-zinc-400 text-sm">{state.message}</p>
        <Link href="/" className="text-xs text-zinc-600 hover:text-white">Go to gallery home</Link>
      </div>
    )
  }

  if (state.type === 'requires_password') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" className="text-zinc-400">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">{state.albumTitle}</h1>
            <p className="text-sm text-zinc-400 mt-1">This album is password protected</p>
          </div>
          <form onSubmit={handlePassword} className="space-y-3">
            {pwError && (
              <p className="text-sm text-red-400 text-center">{pwError}</p>
            )}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter album password"
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5
                         text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-500 text-center"
            />
            <button
              type="submit"
              disabled={checking || !password}
              className="w-full rounded-lg bg-white text-black font-semibold py-2.5 text-sm
                         hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'View Album'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const { album, tokenMeta } = state

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Album header */}
      <div className="relative h-44 sm:h-60 overflow-hidden">
        {album.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover opacity-50" />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
          <p className="text-xs text-zinc-500 mb-1">
            Shared by{' '}
            <Link href={`/u/${album.collection.owner.username}`} className="text-zinc-400 hover:text-white">
              {album.collection.owner.displayName}
            </Link>
            {tokenMeta.label ? ` · ${tokenMeta.label}` : ''}
          </p>
          <h1 className="text-2xl font-bold">{album.title}</h1>
          {album.description && (
            <p className="text-sm text-zinc-400 mt-1 max-w-xl">{album.description}</p>
          )}
          <p className="text-xs text-zinc-600 mt-1.5">{album.photoCount} photos</p>
        </div>
      </div>

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2 space-y-2">
          {album.items.map(item => (
            <div
              key={item.id}
              className="break-inside-avoid rounded-lg overflow-hidden bg-zinc-900 cursor-pointer"
              onClick={() => setLightbox(item.previewUrl)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnailUrl}
                alt={item.caption ?? ''}
                className="w-full h-auto object-cover hover:opacity-90 transition"
                loading="lazy"
              />
              {item.caption && (
                <p className="text-xs text-zinc-500 px-2 py-1.5">{item.caption}</p>
              )}
            </div>
          ))}
        </div>

        {album.allowDownload && (
          <div className="mt-8 text-center">
            <p className="text-xs text-zinc-500">Right-click or long-press photos to save</p>
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
            className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl leading-none"
            onClick={() => setLightbox(null)}
          >×</button>
        </div>
      )}
    </div>
  )
}
