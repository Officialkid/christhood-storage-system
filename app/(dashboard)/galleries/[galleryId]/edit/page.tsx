import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions }        from '@/lib/auth'
import { prisma }             from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { GalleryEditorClient } from './GalleryEditorClient'

export const dynamic = 'force-dynamic'

export default async function GalleryEditPage(
  props: {
    params: Promise<{ galleryId: string }>
  }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const { role, id: userId } = session.user

  // Uploaders cannot access the editor
  if (role === 'UPLOADER') redirect('/galleries')

  const gallery = await prisma.publicGallery.findUnique({
    where:   { id: params.galleryId },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          files: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
      createdBy: { select: { id: true, name: true, username: true } },
    },
  })

  if (!gallery) notFound()

  // EDITOR can only edit their own galleries
  if (role === 'EDITOR' && gallery.createdById !== userId) redirect('/galleries')

  // Archived galleries: redirect back to list
  if (gallery.status === 'ARCHIVED') redirect('/galleries')

  // Serialise all dates, keys → URLs, BigInts
  const serialised = {
    id:                     gallery.id,
    slug:                   gallery.slug,
    title:                  gallery.title,
    description:            gallery.description,
    categoryName:           gallery.categoryName,
    year:                   gallery.year,
    status:                 gallery.status as string,
    coverImageKey:          gallery.coverImageKey,
    coverUrl:               gallery.coverImageKey
                              ? getGalleryPublicUrl(gallery.coverImageKey)
                              : null,
    allowDownload:          gallery.allowDownload,
    allowFullRes:           gallery.allowFullRes,
    requireNameForDownload: gallery.requireNameForDownload,
    isPasswordProtected:    gallery.isPasswordProtected,
    totalPhotos:            gallery.totalPhotos,
    createdById:            gallery.createdById,
    createdBy:              gallery.createdBy,
    sections: gallery.sections.map(s => ({
      id:        s.id,
      title:     s.title,
      date:      s.date?.toISOString() ?? null,
      sortOrder: s.sortOrder,
      photoCount: s.photoCount,
      files: s.files.map(f => ({
        id:           f.id,
        originalName: f.originalName,
        thumbnailUrl: getGalleryPublicUrl(f.thumbnailKey),
        previewUrl:   getGalleryPublicUrl(f.previewKey),
        isVisible:    f.isVisible,
        sortOrder:    f.sortOrder,
        width:        f.width,
        height:       f.height,
      })),
    })),
  }

  return (
    <GalleryEditorClient
      gallery={serialised}
      userRole={role}
      userId={userId}
    />
  )
}
