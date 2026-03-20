import { getServerSession } from 'next-auth'
import { redirect }         from 'next/navigation'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { GalleryListClient }   from './GalleryListClient'

export const dynamic = 'force-dynamic'

export default async function GalleriesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const { role, id: userId } = session.user

  // Build role-based where clause
  const where =
    role === 'ADMIN'
      ? {}
      : role === 'EDITOR'
      ? { OR: [{ createdById: userId }, { status: 'PUBLISHED' as const }] }
      : { status: 'PUBLISHED' as const }

  const galleries = await prisma.publicGallery.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      createdBy:   { select: { id: true, name: true, username: true } },
      publishedBy: { select: { id: true, name: true } },
      _count:      { select: { files: true, views: true } },
    },
  })

  // Serialise — no BigInt, no Date objects, add cover URL
  const serialised = galleries.map(g => ({
    id:           g.id,
    slug:         g.slug,
    title:        g.title,
    description:  g.description,
    categoryName: g.categoryName,
    year:         g.year,
    status:       g.status as string,
    coverUrl:     g.coverImageKey ? getGalleryPublicUrl(g.coverImageKey) : null,
    totalPhotos:  g.totalPhotos,
    viewCount:    g.viewCount,
    createdAt:    g.createdAt.toISOString(),
    publishedAt:  g.publishedAt?.toISOString() ?? null,
    createdById:  g.createdById,
    createdBy:    g.createdBy,
    publishedBy:  g.publishedBy,
    fileCount:    g._count.files,
  }))

  return (
    <GalleryListClient
      galleries={serialised}
      userRole={role}
      userId={userId}
    />
  )
}
