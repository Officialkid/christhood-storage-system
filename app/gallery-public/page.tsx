import Link              from 'next/link'
import { prisma }        from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { Camera }        from 'lucide-react'
import { getGallerySessionServer } from '@/lib/photo-gallery/session'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────
interface GalleryItem {
  id:           string
  slug:         string
  title:        string
  categoryName: string | null
  year:         number
  coverUrl:     string | null
  totalPhotos:  number
}

// ─── Gallery card ─────────────────────────────────────────────────────────────
function GalleryCard({ g }: { g: GalleryItem }) {
  return (
    <Link
      href={`/gallery-public/${g.slug}`}
      className="relative block aspect-[4/3] overflow-hidden rounded-xl group bg-zinc-900"
    >
      {g.coverUrl ? (
        <img
          src={g.coverUrl}
          alt={g.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500
                     group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Camera className="w-8 h-8 text-zinc-700" />
        </div>
      )}

      {/* Dark gradient scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Year badge — top left */}
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white
                       text-xs font-semibold px-2 py-0.5 rounded-md">
        {g.year}
      </div>

      {/* Photo count — top right */}
      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white
                       text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
        <Camera className="w-3 h-3" />
        {g.totalPhotos.toLocaleString()}
      </div>

      {/* Title — bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{g.title}</p>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function GalleryHomePage() {
  const [raw, gpSession] = await Promise.all([
    prisma.publicGallery.findMany({
      where:   { status: 'PUBLISHED' },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, slug: true, title: true, categoryName: true, year: true,
        coverImageKey: true, totalPhotos: true,
      },
    }),
    getGallerySessionServer(),
  ])

  // Serialize
  const galleries: GalleryItem[] = raw.map(g => ({
    id:           g.id,
    slug:         g.slug,
    title:        g.title,
    categoryName: g.categoryName,
    year:         g.year,
    coverUrl:     g.coverImageKey ? getGalleryPublicUrl(g.coverImageKey) : null,
    totalPhotos:  g.totalPhotos,
  }))

  // Group by category
  const categoryOrder: string[] = []
  const byCategory: Record<string, GalleryItem[]> = {}
  for (const g of galleries) {
    const cat = g.categoryName ?? 'General'
    if (!byCategory[cat]) {
      byCategory[cat] = []
      categoryOrder.push(cat)
    }
    byCategory[cat].push(g)
  }

  return (
    <div className="min-h-screen bg-black">
      {/* ── Platform top nav ───────────────────────────────────────────────── */}
      <nav className="border-b border-zinc-900 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-white tracking-tight">
          Christhood Gallery
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {gpSession ? (
            <Link href="/dashboard" className="text-zinc-300 hover:text-white transition-colors">
              My Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login"  className="text-zinc-400 hover:text-white transition-colors">Log in</Link>
              <Link href="/signup" className="rounded-lg bg-white text-black font-medium px-3 py-1.5
                                              text-xs hover:bg-zinc-200 transition-colors">
                Create gallery
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-4 sm:px-6 pt-8 pb-6 max-w-7xl mx-auto">
        {/* Logo row */}
        <div className="flex items-center gap-3 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.svg" alt="Christhood" className="w-8 h-8 rounded-lg" />
          <span className="text-white font-bold text-lg tracking-tight">Christhood</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Media Gallery</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Memories from our services, missions, and community gatherings
        </p>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {galleries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <Camera className="w-12 h-12 text-zinc-700 mb-4" />
          <p className="text-zinc-500 text-lg font-medium">No galleries published yet</p>
          <p className="text-zinc-600 text-sm mt-1">Check back soon</p>
        </div>
      ) : (
        <main className="px-4 sm:px-6 pb-16 max-w-7xl mx-auto space-y-10">
          {categoryOrder.map(category => (
            <section key={category}>
              <h2 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                {category}
                <span className="text-zinc-600 font-normal text-sm">
                  {byCategory[category].length} {byCategory[category].length === 1 ? 'gallery' : 'galleries'}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {byCategory[category].map(g => (
                  <GalleryCard key={g.id} g={g} />
                ))}
              </div>
            </section>
          ))}
        </main>
      )}

      {/* ── Your own gallery CTA ───────────────────────────────────────────── */}
      {!gpSession && (
        <section className="border-t border-zinc-900 py-14 px-4 text-center">
          <h2 className="text-white text-2xl font-bold">Share your own photos</h2>
          <p className="text-zinc-400 text-sm mt-2 max-w-sm mx-auto">
            Create a free gallery, organise your albums, and share them privately or publicly.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Link
              href="/signup"
              className="rounded-lg bg-white text-black font-semibold px-5 py-2.5 text-sm
                         hover:bg-zinc-200 transition-colors"
            >
              Start for free
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-zinc-700 text-zinc-300 font-medium px-5 py-2.5
                         text-sm hover:border-zinc-500 hover:text-white transition-colors"
            >
              Sign in
            </Link>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 py-6 text-center">
        <p className="text-zinc-600 text-xs">Christhood Media Team</p>
        <p className="text-zinc-700 text-xs mt-0.5">© {new Date().getFullYear()} Christhood</p>
      </footer>
    </div>
  )
}
