'use client'

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react'
import { useRouter } from 'next/navigation'
import Link         from 'next/link'
import {
  ArrowLeft, Lock, Download, Camera, Loader2, Check, Share2,
} from 'lucide-react'
import { Lightbox, type LightboxPhoto } from './Lightbox'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GalleryFile {
  id:           string
  originalName: string
  thumbnailUrl: string
  previewUrl:   string
  width:        number | null
  height:       number | null
}

interface GallerySection {
  id:         string
  title:      string
  date:       string | null
  photoCount: number
  files:      GalleryFile[]
}

interface Gallery {
  id:                     string
  slug:                   string
  title:                  string
  description:            string | null
  coverUrl:               string | null
  allowDownload:          boolean
  requireNameForDownload: boolean
  isPasswordProtected:    boolean
  totalPhotos:            number
  sections:               GallerySection[]
}

interface Props {
  gallery:           Gallery
  passwordVerified:  boolean
}

// ─── Date formatter ───────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}
function fmtChip(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─── Password gate ────────────────────────────────────────────────────────────

function PasswordGate({ galleryId, title, coverUrl, onVerified }: {
  galleryId: string; title: string; coverUrl: string | null; onVerified: () => void
}) {
  const router   = useRouter()
  const [pw,  setPw]  = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw.trim()) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(`/api/gallery/public/${galleryId}/verify-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: pw }),
      })
      if (res.ok) {
        // Cookie is set by the server response — refresh to re-run server component
        router.refresh()
        onVerified()
      } else {
        setErr('Incorrect password — please try again')
        setPw('')
      }
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      {coverUrl && (
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="w-full h-full object-cover opacity-20 blur-xl scale-110" />
        </div>
      )}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.svg" alt="Christhood" className="w-8 h-8 rounded-lg" />
          <span className="text-white font-bold text-lg">Christhood</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-3">
              <Lock className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-white font-semibold text-lg leading-tight">{title}</h2>
            <p className="text-zinc-400 text-sm">This gallery is password protected</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              value={pw}
              onChange={e => { setPw(e.target.value); setErr('') }}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3
                         text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500
                         text-base"
            />
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button
              type="submit"
              disabled={busy || !pw.trim()}
              className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm
                         hover:bg-zinc-100 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              View Gallery
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link href="/gallery-public"
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to galleries
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Name modal (for requireNameForDownload) ──────────────────────────────────

function NameModal({ onSubmit, onCancel }: {
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center
                    bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm space-y-4">
        <div>
          <h3 className="text-white font-semibold text-base">Enter your name to download</h3>
          <p className="text-zinc-400 text-sm mt-1">
            Your name helps us know who is downloading our photos.
          </p>
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name (e.g. Grace Wanjiku)"
          autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3
                     text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-base"
        />
        <div className="flex gap-2">
          <button onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300
                             hover:bg-zinc-800 transition-colors text-sm">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onSubmit(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-white text-black font-semibold text-sm
                       hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function GalleryView({ gallery, passwordVerified: initialPwVerified }: Props) {
  const [pwVerified,       setPwVerified]       = useState(initialPwVerified)
  const [activeSectionId,  setActiveSectionId]  = useState<string | null>(
    gallery.sections[0]?.id ?? null,
  )
  const [lightboxIndex,    setLightboxIndex]    = useState(-1)
  const [visitorName,      setVisitorName]      = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('gallery_visitor_name') ?? ''
    return ''
  })
  const [pendingDlFileId,  setPendingDlFileId]  = useState<string | null>(null)
  const [zipLoading,       setZipLoading]       = useState(false)
  const [chipRef,          setChipRef]          = useState<HTMLDivElement | null>(null)
  const [supportsShare,    setSupportsShare]    = useState(false)
  const [shareCopied,      setShareCopied]      = useState(false)

  useEffect(() => { setSupportsShare(!!navigator.share) }, [])

  async function handleShareGallery() {
    const url = typeof window !== 'undefined' ? window.location.href : `https://gallery.cmmschristhood.org/${gallery.slug}`
    try {
      await navigator.share({
        title: gallery.title,
        text:  `Check out these photos from Christhood: ${gallery.title}`,
        url,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await navigator.clipboard.writeText(url).catch(() => {})
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      }
    }
  }

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ── Analytics: fire view on mount ───────────────────────────────────────
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    const deviceType = /tablet|ipad/.test(ua)
      ? 'TABLET'
      : /mobile|android|iphone/.test(ua)
      ? 'MOBILE'
      : 'DESKTOP'
    fetch(`/api/gallery/public/${gallery.id}/view`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ deviceType }),
    }).catch(() => {})
  }, [gallery.id])

  // Restore visitor name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gallery_visitor_name')
    if (saved) setVisitorName(saved)
  }, [])

  // ── Flat photo list for lightbox ─────────────────────────────────────────
  const allPhotos = useMemo<LightboxPhoto[]>(() =>
    gallery.sections.flatMap(s =>
      s.files.map(f => ({
        id:           f.id,
        originalName: f.originalName,
        previewUrl:   f.previewUrl,
        sectionTitle: s.title,
        sectionDate:  s.date,
        galleryId:    gallery.id,
        gallerySlug:  gallery.slug,
      })),
    ),
    [gallery.sections, gallery.id, gallery.slug],
  )

  // ── Section offset index for lightbox (section i starts at this flat index) ─
  const sectionPhotoOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let n = 0
    for (const s of gallery.sections) {
      offsets[s.id] = n
      n += s.files.length
    }
    return offsets
  }, [gallery.sections])

  // ── IntersectionObserver: highlight active section chip ──────────────────
  useEffect(() => {
    if (!pwVerified) return
    const observers: IntersectionObserver[] = []

    gallery.sections.forEach(section => {
      const el = sectionRefs.current.get(section.id)
      if (!el) return
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSectionId(section.id) },
        { threshold: 0.05, rootMargin: '-80px 0px -55% 0px' },
      )
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [gallery.sections, pwVerified])

  // Scroll active chip into view when it changes
  useEffect(() => {
    if (!chipRef || !activeSectionId) return
    const chip = chipRef.querySelector(`[data-section="${activeSectionId}"]`) as HTMLElement | null
    chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeSectionId, chipRef])

  function scrollToSection(sectionId: string) {
    sectionRefs.current.get(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openLightbox(flatIndex: number) {
    setLightboxIndex(flatIndex)
  }

  function handleRequestName(fileId: string) {
    setPendingDlFileId(fileId)
  }

  function handleNameSubmit(name: string) {
    localStorage.setItem('gallery_visitor_name', name)
    setVisitorName(name)
    if (pendingDlFileId) {
      const url = `/api/gallery/public/${gallery.id}/files/${pendingDlFileId}/download?name=${encodeURIComponent(name)}`
      window.location.href = url
    }
    setPendingDlFileId(null)
  }

  async function downloadAll() {
    if (gallery.requireNameForDownload && !visitorName) {
      setPendingDlFileId('__zip__')
      return
    }
    setZipLoading(true)
    const nameParam = visitorName ? `?name=${encodeURIComponent(visitorName)}` : ''
    window.location.href = `/api/gallery/public/${gallery.id}/download-all${nameParam}`
    setTimeout(() => setZipLoading(false), 3000)
  }

  // ─── Password not verified ────────────────────────────────────────────────
  if (gallery.isPasswordProtected && !pwVerified) {
    return (
      <PasswordGate
        galleryId={gallery.id}
        title={gallery.title}
        coverUrl={gallery.coverUrl}
        onVerified={() => setPwVerified(true)}
      />
    )
  }

  const hasPhotos = gallery.sections.some(s => s.files.length > 0)

  return (
    <div className="min-h-screen bg-black">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative">
        {gallery.coverUrl ? (
          <div className="relative h-[42vw] min-h-[200px] max-h-[480px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gallery.coverUrl}
              alt={gallery.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-5 max-w-4xl mx-auto">
              <BackLink />
              <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2 leading-tight">
                {gallery.title}
              </h1>
              {gallery.description && (
                <p className="text-white/70 text-sm mt-1 line-clamp-2">{gallery.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="text-white/50 text-xs flex items-center gap-1">
                  <Camera className="w-3 h-3" /> {gallery.totalPhotos.toLocaleString()} photos
                </span>
                {gallery.allowDownload && (
                  <button
                    onClick={downloadAll}
                    disabled={zipLoading}
                    className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25
                               text-white px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm"
                  >
                    {zipLoading
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Preparing ZIP…</>
                      : <><Download className="w-3 h-3" /> Download All</>}
                  </button>
                )}
                {supportsShare && (
                  <button
                    onClick={handleShareGallery}
                    className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25
                               text-white px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm"
                  >
                    {shareCopied
                      ? <><Check className="w-3 h-3" /> Copied!</>
                      : <><Share2 className="w-3 h-3" /> Share ↗</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 sm:px-6 pt-6 pb-4 max-w-4xl mx-auto">
            <BackLink />
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">{gallery.title}</h1>
            {gallery.description && (
              <p className="text-zinc-400 text-sm mt-1">{gallery.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-zinc-500 text-xs flex items-center gap-1">
                <Camera className="w-3 h-3" /> {gallery.totalPhotos.toLocaleString()} photos
              </span>
              {gallery.allowDownload && (
                <button
                  onClick={downloadAll}
                  disabled={zipLoading}
                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700
                             text-white px-3 py-1.5 rounded-full transition-colors"
                >
                  {zipLoading
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Preparing ZIP…</>
                    : <><Download className="w-3 h-3" /> Download All</>}
                </button>
              )}
              {supportsShare && (
                <button
                  onClick={handleShareGallery}
                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700
                             text-white px-3 py-1.5 rounded-full transition-colors"
                >
                  {shareCopied
                    ? <><Check className="w-3 h-3" /> Copied!</>
                    : <><Share2 className="w-3 h-3" /> Share ↗</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section chip nav (sticky) ──────────────────────────────────── */}
      {gallery.sections.length > 1 && (
        <div
          ref={setChipRef}
          className="sticky top-0 z-20 bg-black/90 backdrop-blur-sm border-b border-zinc-900
                     overflow-x-auto scrollbar-none px-4 sm:px-6 py-2 flex gap-2 whitespace-nowrap"
        >
          <button
            onClick={() => scrollToSection(gallery.sections[0].id)}
            data-section="__all__"
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${activeSectionId === gallery.sections[0].id
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            All Photos
          </button>
          {gallery.sections.map(s => (
            <button
              key={s.id}
              data-section={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeSectionId === s.id
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              {s.date ? fmtChip(s.date) : s.title}
            </button>
          ))}
        </div>
      )}

      {/* ── Photo grid ────────────────────────────────────────────────── */}
      {!hasPhotos ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <Camera className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-zinc-500">No photos in this gallery yet</p>
        </div>
      ) : (
        <main className="px-0.5 sm:px-1 pb-16 max-w-screen-2xl mx-auto">
          {gallery.sections.map((section) => {
            const offset = sectionPhotoOffsets[section.id]
            return (
              <div
                key={section.id}
                ref={el => {
                  if (el) sectionRefs.current.set(section.id, el)
                  else    sectionRefs.current.delete(section.id)
                }}
                id={`section-${section.id}`}
              >
                {/* Section divider */}
                <div className="px-3 py-3 mt-2">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="text-zinc-500 text-xs font-medium shrink-0">
                      {section.date
                        ? `${fmtDate(section.date)} · ${section.files.length} photos`
                        : `${section.title} · ${section.files.length} photos`}
                    </span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                </div>

                {/* Masonry grid */}
                <div
                  className="columns-2 sm:columns-3 lg:columns-4"
                  style={{ columnGap: '2px' }}
                >
                  {section.files.map((file, fi) => (
                    <Photo
                      key={file.id}
                      file={file}
                      flatIndex={offset + fi}
                      allowDownload={gallery.allowDownload}
                      requireName={gallery.requireNameForDownload}
                      visitorName={visitorName}
                      galleryId={gallery.id}
                      onOpen={openLightbox}
                      onRequestName={handleRequestName}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </main>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 py-6 text-center">
        <p className="text-zinc-600 text-xs">Christhood Media Team</p>
        <p className="text-zinc-700 text-xs mt-0.5">© {new Date().getFullYear()} Christhood</p>
      </footer>

      {/* ── Lightbox ──────────────────────────────────────────────────── */}
      {lightboxIndex >= 0 && allPhotos.length > 0 && (
        <Lightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          allowDownload={gallery.allowDownload}
          visitorName={visitorName}
          requireName={gallery.requireNameForDownload}
          onClose={() => setLightboxIndex(-1)}
          onRequestName={handleRequestName}
        />
      )}

      {/* ── Name modal ────────────────────────────────────────────────── */}
      {pendingDlFileId && (
        <NameModal
          onSubmit={handleNameSubmit}
          onCancel={() => setPendingDlFileId(null)}
        />
      )}
    </div>
  )
}

// ─── Individual photo card ────────────────────────────────────────────────────

function Photo({
  file, flatIndex, allowDownload, requireName, visitorName, galleryId, onOpen, onRequestName,
}: {
  file:          GalleryFile
  flatIndex:     number
  allowDownload: boolean
  requireName:   boolean
  visitorName:   string
  galleryId:     string
  onOpen:        (i: number) => void
  onRequestName: (fileId: string) => void
}) {
  const [loaded, setLoaded] = useState(false)

  function handleDownloadClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (requireName && !visitorName) {
      onRequestName(file.id)
      return
    }
    const nameParam = visitorName ? `?name=${encodeURIComponent(visitorName)}` : ''
    window.location.href = `/api/gallery/public/${galleryId}/files/${file.id}/download${nameParam}`
  }

  return (
    <div
      className="relative break-inside-avoid group cursor-pointer overflow-hidden"
      style={{ marginBottom: '2px' }}
      onClick={() => onOpen(flatIndex)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.thumbnailUrl}
        alt={file.originalName}
        width={file.width ?? undefined}
        height={file.height ?? undefined}
        loading="lazy"
        className={`w-full h-auto block transition-all duration-300
                    group-hover:scale-[1.02]
                    ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />

      {/* Download icon on hover */}
      {allowDownload && (
        <button
          onClick={handleDownloadClick}
          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          title="Download original"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Back link ────────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/gallery-public"
      className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Galleries
    </Link>
  )
}
