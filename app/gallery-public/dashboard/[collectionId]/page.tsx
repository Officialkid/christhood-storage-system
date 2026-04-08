import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getGallerySessionServer } from '@/lib/photo-gallery/session'
import { prisma } from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

type Props = { params: Promise<{ collectionId: string }> }

export default async function CollectionPage({ params }: Props) {
  const session = await getGallerySessionServer()
  if (!session) redirect('/login')

  const { collectionId } = await params

  const collection = await prisma.photoCollection.findFirst({
    where:   { id: collectionId, ownerId: session.userId },
    include: {
      albums: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      },
    },
  })

  if (!collection) notFound()

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">
          ← Dashboard
        </Link>
        <h1 className="text-lg font-semibold truncate">{collection.title}</h1>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-zinc-400">
            {collection.albums.length} album{collection.albums.length !== 1 ? 's' : ''}
          </p>
          <NewAlbumForm collectionId={collection.id} />
        </div>

        {collection.albums.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-12 text-center">
            <p className="text-zinc-400 text-sm">No albums yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Create your first album to start uploading photos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collection.albums.map(album => {
              const coverUrl = album.coverKey ? getGalleryPublicUrl(album.coverKey) : null
              return (
                <Link
                  key={album.id}
                  href={`/dashboard/${collection.id}/${album.id}`}
                  className="group relative rounded-xl overflow-hidden border border-zinc-800
                             hover:border-zinc-600 transition-colors bg-zinc-950 aspect-[4/3]"
                >
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt={album.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105
                                 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-semibold text-sm truncate">{album.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-400">{album.photoCount} photos</span>
                      <VisibilityBadge visibility={album.visibility} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const map: Record<string, string> = {
    PUBLIC:   'text-emerald-400',
    PRIVATE:  'text-zinc-500',
    PASSWORD: 'text-amber-400',
  }
  const label: Record<string, string> = {
    PUBLIC: 'Public', PRIVATE: 'Private', PASSWORD: 'Password',
  }
  return (
    <span className={`text-xs ${map[visibility] ?? 'text-zinc-500'}`}>
      · {label[visibility] ?? visibility}
    </span>
  )
}

function NewAlbumForm({ collectionId }: { collectionId: string }) {
  return (
    <Link
      href={`/dashboard/${collectionId}?new=album`}
      className="rounded-lg bg-white text-black text-sm font-semibold px-4 py-2
                 hover:bg-zinc-200 transition-colors"
    >
      + New album
    </Link>
  )
}
