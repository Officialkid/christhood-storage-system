import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { GalleryListClient } from './GalleryListClient'

export const dynamic = 'force-dynamic'

export default async function GalleriesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const role = ((session.user as any).role ?? 'UPLOADER') as 'ADMIN' | 'EDITOR' | 'UPLOADER'
  const userId = (session.user as any).id as string

  const galleries = await prisma.publicGallery.findMany({
    where: role === 'ADMIN'
      ? { status: { notIn: ['DELETED', 'PURGED'] } }
      : role === 'EDITOR'
        ? {
            status: { notIn: ['DELETED', 'PURGED'] },
            OR: [
              { createdById: userId },
              { status: 'PUBLISHED' },
            ],
          }
        : { status: 'PUBLISHED' },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      categoryName: true,
      year: true,
      status: true,
      coverImageKey: true,
      totalPhotos: true,
      viewCount: true,
      createdAt: true,
      publishedAt: true,
      createdById: true,
      createdBy: { select: { id: true, name: true, username: true } },
      publishedBy: { select: { id: true, name: true } },
      _count: { select: { files: true } },
    },
    orderBy: [
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  const serialized = galleries.map(gallery => ({
    id: gallery.id,
    slug: gallery.slug,
    title: gallery.title,
    description: gallery.description,
    categoryName: gallery.categoryName,
    year: gallery.year,
    status: gallery.status,
    coverUrl: gallery.coverImageKey ? getGalleryPublicUrl(gallery.coverImageKey) : null,
    totalPhotos: gallery.totalPhotos,
    viewCount: gallery.viewCount,
    createdAt: gallery.createdAt.toISOString(),
    publishedAt: gallery.publishedAt?.toISOString() ?? null,
    createdById: gallery.createdById,
    createdBy: gallery.createdBy,
    publishedBy: gallery.publishedBy,
    fileCount: gallery._count.files,
  }))

  return <GalleryListClient galleries={serialized} userRole={role} userId={userId} />
}
