'use client'

import { useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Share2, Check, Copy } from 'lucide-react'
import { useState } from 'react'

export interface LightboxPhoto {
  id:           string
  originalName: string
  previewUrl:   string
  sectionTitle: string
  sectionDate:  string | null
  galleryId:    string
  gallerySlug:  string
}

interface Props {
  photos:          LightboxPhoto[]
  initialIndex:    number
  allowDownload:   boolean
  visitorName:     string
  onClose:         () => void
  onRequestName:   (fileId: string) => void   // called when name is required before download
  requireName:     boolean
}

export function Lightbox({
  photos, initialIndex, allowDownload, visitorName, requireName, onClose, onRequestName,
}: Props) {
  const [index,        setIndex]        = useState(initialIndex)
  const [imgLoaded,    setImgLoaded]    = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [supportsShare, setSupportsShare] = useState(false)

  useEffect(() => { setSupportsShare(!!navigator.share) }, [])
  const touchStartX   = useRef<number | null>(null)
  const touchStartY   = useRef<number | null>(null)
  const containerRef  = useRef<HTMLDivElement>(null)

  const current = photos[index]
  if (!current) return null

  const goNext = useCallback(() => {
    setIndex(i => Math.min(i + 1, photos.length - 1))
    setImgLoaded(false)
  }, [photos.length])

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(i - 1, 0))
    setImgLoaded(false)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev, onClose])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Reset loaded state when photo changes
  useEffect(() => { setImgLoaded(false) }, [current.previewUrl])

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    if (absDx > 50 && absDx > absDy) {
      if (dx < 0) goNext(); else goPrev()
    } else if (dy > 100 && absDy > absDx) {
      onClose()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  function handleDownload() {
    if (requireName && !visitorName) {
      onRequestName(current.id)
      return
    }
    const nameParam = visitorName ? `?name=${encodeURIComponent(visitorName)}` : ''
    const url = `/api/gallery/public/${current.galleryId}/files/${current.id}/download${nameParam}`
    window.location.href = url
  }

  async function handleNativeShare() {
    const url = `${window.location.origin}/gallery-public/${current.gallerySlug}#photo-${current.id}`
    try {
      await navigator.share({ title: current.originalName, text: `Check out this photo from Christhood`, url })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await handleCopyLink()
      }
    }
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/gallery-public/${current.gallerySlug}#photo-${current.id}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Tap left/right thirds to navigate
  function handleBackdropTap(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const third = rect.width / 3
    if (x < third) goPrev()
    else if (x > third * 2) goNext()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Top controls ────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between
                      px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
        <div className="text-sm text-white/70">
          {index + 1} / {photos.length}
        </div>
        <div className="flex items-center gap-2">
          {allowDownload && (
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Download original"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {supportsShare && (
            <button
              onClick={handleNativeShare}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Share photo"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleCopyLink}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Copy photo link"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Photo area ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden cursor-pointer"
        onClick={handleBackdropTap}
      >
        {/* Prev arrow */}
        {index > 0 && (
          <button
            onClick={e => { e.stopPropagation(); goPrev() }}
            className="absolute left-3 z-10 p-2 rounded-full bg-black/50 text-white
                       hover:bg-black/80 transition-colors hidden sm:flex"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Photo */}
        <div className="relative max-w-full max-h-full flex items-center justify-center px-0 sm:px-16 py-16">
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.previewUrl}
            src={current.previewUrl}
            alt={current.originalName}
            className={`max-w-full max-h-[calc(100vh-120px)] object-contain transition-opacity duration-200
                        ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        </div>

        {/* Next arrow */}
        {index < photos.length - 1 && (
          <button
            onClick={e => { e.stopPropagation(); goNext() }}
            className="absolute right-3 z-10 p-2 rounded-full bg-black/50 text-white
                       hover:bg-black/80 transition-colors hidden sm:flex"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-3
                      bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <p className="text-white/60 text-xs text-center truncate">
          {current.originalName}
        </p>
      </div>
    </div>
  )
}
