/**
 * PATCH /api/gallery/[galleryId]/publish
 * Publishes a PENDING_REVIEW gallery → PUBLISHED.
 * ADMIN ONLY.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { logger }                     from '@/lib/logger'
import { createInAppNotification }    from '@/lib/notifications'
import { ApiError, handleApiError }   from '@/lib/apiError'

const GALLERY_PUBLIC_BASE = 'https://gallery.cmmschristhood.org'

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user

    if (role !== 'ADMIN') {
      throw new ApiError(403, 'Only admins can publish galleries.')
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: {
        id: true, title: true, slug: true, status: true,
        createdById: true, totalPhotos: true,
      },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    if (gallery.status !== 'PENDING_REVIEW') {
      throw new ApiError(409, `Only galleries awaiting review can be published. Current status: ${gallery.status}.`)
    }

    const visiblePhotos = await prisma.galleryFile.count({
      where: { galleryId, isVisible: true },
    })

    if (visiblePhotos < 1) {
      throw new ApiError(422, 'Add at least one visible photo before publishing this gallery.')
    }

    const updated = await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  {
        status:        'PUBLISHED',
        publishedById: userId,
        publishedAt:   new Date(),
      },
      select: { id: true, slug: true, title: true, publishedAt: true },
    })

    const galleryUrl = `${GALLERY_PUBLIC_BASE}/${updated.slug}`

    // Notify the gallery creator
    await createInAppNotification(
      gallery.createdById,
      `Your gallery "${gallery.title}" has been published and is now live.`,
      galleryUrl,
      'success',
      'Gallery Published',
    )

    logger.info('GALLERY_PUBLISHED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/publish`,
      message:   `Gallery "${updated.title}" published`,
      metadata:  { galleryId, slug: updated.slug, title: updated.title, url: galleryUrl },
    })

    return NextResponse.json({
      status:      'PUBLISHED',
      publishedAt: updated.publishedAt,
      url:         galleryUrl,
    })
  } catch (err) {
    logger.error('GALLERY_PUBLISH_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/publish`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error publishing gallery',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/publish PATCH`)
  }
}
