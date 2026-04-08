import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getGallerySessionServer } from '@/lib/photo-gallery/session'
import { prisma } from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

export default async function DashboardPage() {
  const session = await getGallerySessionServer()
  if (!session) redirect('/login')

  const user = await prisma.photoUser.findUnique({
    where:  { id: session.userId },
    select: {
      displayName:       true,
      storageUsedBytes:  true,
      storageLimitBytes: true,
      planTier:          true,
    },
  })

  const collections = await prisma.photoCollection.findMany({
    where:   { ownerId: session.userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { albums: true } },
      albums: {
        take:    1,
        orderBy: { createdAt: 'desc' },
        select:  { coverKey: true, photoCount: true },
      },
    },
  })

  const usedMB  = user ? Math.round(Number(user.storageUsedBytes)  / 1024 / 1024) : 0
  const totalMB = user ? Math.round(Number(user.storageLimitBytes) / 1024 / 1024) : 5120
  const pct     = Math.min(100, Math.round((usedMB / totalMB) * 100))

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">Christhood Gallery</Link>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <span className="hidden sm:inline">Hello, {session.displayName}</span>
          <form action="/api/photo/auth/logout" method="POST">
            <button type="submit" className="hover:text-white transition-colors">Sign out</button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Storage usage */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-sm text-zinc-400">
              Storage — <span className="text-white font-medium">{usedMB} MB</span> of{' '}
              <span className="text-white font-medium">{Math.round(totalMB / 1024)} GB</span> used
            </p>
            <div className="w-full max-w-xs h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : 'bg-white'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {user?.planTier === 'FREE' && (
            <a
              href="/upgrade"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-4 py-2
                         text-sm font-medium hover:border-white hover:bg-zinc-900 transition-colors"
            >
              Upgrade to Premium
            </a>
          )}
        </section>

        {/* Collections */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold">Your Collections</h2>
            <NewCollectionButton />
          </div>

          {collections.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(col => {
                const coverKey = col.albums[0]?.coverKey ?? null
                const coverUrl = coverKey ? getGalleryPublicUrl(coverKey) : null
                return (
                  <Link
                    key={col.id}
                    href={`/dashboard/${col.id}`}
                    className="group relative rounded-xl overflow-hidden border border-zinc-800
                               hover:border-zinc-600 transition-colors bg-zinc-950 aspect-[4/3]"
                  >
                    {coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverUrl}
                        alt={col.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105
                                   transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="font-semibold text-sm truncate">{col.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {col._count.albums} album{col._count.albums !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function NewCollectionButton() {
  return (
    <form action="/api/photo/collections" method="POST">
      <Link
        href="?new=collection"
        className="rounded-lg bg-white text-black text-sm font-semibold px-4 py-2
                   hover:bg-zinc-200 transition-colors"
      >
        + New collection
      </Link>
    </form>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 p-12 text-center">
      <p className="text-zinc-400 text-sm">No collections yet.</p>
      <p className="text-zinc-600 text-xs mt-1">
        Create your first collection to start organising your photos.
      </p>
    </div>
  )
}
