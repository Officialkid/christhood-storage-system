import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import { redirect }         from 'next/navigation'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { ReviewClient }     from './ReviewClient'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ galleryId: string }> }

export default async function GalleryReviewPage(props: Props) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const { role } = session.user as { role: string; id: string }

  // Only admins can access the review action panel; editors can view read-only
  const gallery = await prisma.publicGallery.findUnique({
    where: { id: params.galleryId },
    include: {
      createdBy:   { select: { id: true, name: true, username: true } },
      publishedBy: { select: { id: true, name: true } },
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          files: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  })

  if (!gallery) redirect('/galleries')

  // Non-admins can only view published galleries here
  if (role !== 'ADMIN' && gallery.status !== 'PUBLISHED') redirect('/galleries')

  const serialized = {
    id:                     gallery.id,
    slug:                   gallery.slug,
    title:                  gallery.title,
    description:            gallery.description,
    categoryName:           gallery.categoryName,
    year:                   gallery.year,
    status:                 gallery.status,
    coverUrl:               gallery.coverImageKey ? getGalleryPublicUrl(gallery.coverImageKey) : null,
    allowDownload:          gallery.allowDownload,
    totalPhotos:            gallery.totalPhotos,
    viewCount:              gallery.viewCount,
    createdAt:              gallery.createdAt.toISOString(),
    publishedAt:            gallery.publishedAt?.toISOString() ?? null,
    createdBy:              gallery.createdBy,
    publishedBy:            gallery.publishedBy,
    sections: gallery.sections.map(s => ({
      id:         s.id,
      title:      s.title,
      date:       s.date?.toISOString() ?? null,
      sortOrder:  s.sortOrder,
      photoCount: s.photoCount,
      files: s.files.map(f => ({
        id:           f.id,
        originalName: f.originalName,
        thumbnailUrl: getGalleryPublicUrl(f.thumbnailKey),
        previewUrl:   getGalleryPublicUrl(f.previewKey),
        isVisible:    f.isVisible,
      })),
    })),
  }

  return (
    <ReviewClient
      gallery={serialized}
      isAdmin={role === 'ADMIN'}
    />
  )
}
