import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

type Props = { params: Promise<{ username: string; collectionSlug: string; albumSlug: string }> }

export default async function PublicAlbumPage({ params }: Props) {
  const { username, collectionSlug, albumSlug } = await params

  const owner = await prisma.photoUser.findUnique({
    where: { username },
    select: { id: true, displayName: true, avatarUrl: true },
  })
  if (!owner) notFound()

  const collection = await prisma.photoCollection.findUnique({
    where: { ownerId_slug: { ownerId: owner.id, slug: collectionSlug } },
    select: { id: true, title: true, slug: true, isVisible: true },
  })
  if (!collection || !collection.isVisible) notFound()

  const album = await prisma.photoAlbum.findUnique({
    where: { collectionId_slug: { collectionId: collection.id, slug: albumSlug } },
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!album) notFound()

  // Only PUBLIC albums are accessible here (PASSWORD albums go through /s/[token])
  if (album.visibility === 'PRIVATE') notFound()

  // Increment view count (fire and forget)
  prisma.photoAlbum.update({
    where: { id: album.id },
    data:  { viewCount: { increment: 1 } },
  }).catch(() => {})

  const coverUrl = album.coverKey ? getGalleryPublicUrl(album.coverKey) : null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Album header */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={album.title} className="w-full h-full object-cover opacity-60" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-900 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <p className="text-xs text-zinc-400 mb-1">
            <Link href={`/u/${username}`} className="hover:text-white">{owner.displayName}</Link>
            {' · '}
            <Link href={`/u/${username}/${collectionSlug}`} className="hover:text-white">{collection.title}</Link>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold">{album.title}</h1>
          {album.description && (
            <p className="mt-1 text-sm text-zinc-400 max-w-xl">{album.description}</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">{album.photoCount} photos · {album.viewCount} views</p>
        </div>
      </div>

      {/* Photo grid */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
        {album.items.length === 0 ? (
          <p className="text-center text-zinc-600 text-sm py-16">No photos in this album yet.</p>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2 space-y-2">
            {album.items.map(item => (
              <div key={item.id} className="break-inside-avoid rounded-lg overflow-hidden bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getGalleryPublicUrl(item.thumbnailKey)}
                  alt={item.caption ?? item.originalName}
                  width={item.width ?? undefined}
                  height={item.height ?? undefined}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
                {item.caption && (
                  <p className="text-xs text-zinc-500 px-2 py-1.5">{item.caption}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {album.allowDownload && album.items.length > 0 && (
          <div className="mt-8 text-center">
            <a
              href={`/api/photo/albums/${album.id}/download`}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5
                         text-sm hover:border-white hover:text-white transition-colors text-zinc-400"
            >
              Download album
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
