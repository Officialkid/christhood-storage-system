/**
 * PATCH /api/gallery/[galleryId]/submit
 * Submits a DRAFT gallery for admin review → PENDING_REVIEW.
 * Only EDITOR (own galleries) can submit. ADMINs use /publish directly.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { logger }                     from '@/lib/logger'
import { createInAppNotification }    from '@/lib/notifications'
import { ApiError, handleApiError }   from '@/lib/apiError'

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId, name: userName } = session.user

    // Only EDITOR can submit (admins review/publish directly)
    if (role !== 'EDITOR') {
      throw new ApiError(403, 'Only editors can submit galleries for review.')
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, slug: true, status: true, createdById: true, totalPhotos: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    if (gallery.createdById !== userId) {
      throw new ApiError(403, 'You can only submit your own galleries for review.')
    }

    if (gallery.status !== 'DRAFT') {
      throw new ApiError(409, `Only draft galleries can be submitted. Current status: ${gallery.status}.`)
    }

    if ((gallery.totalPhotos ?? 0) < 1) {
      throw new ApiError(422, 'Add at least one photo before submitting this gallery for review.')
    }

    await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  { status: 'PENDING_REVIEW' },
    })

    // Notify all admins
    const admins = await prisma.user.findMany({
      where:  { role: 'ADMIN', isActive: true },
      select: { id: true },
    })

    await Promise.allSettled(
      admins.map(admin =>
        createInAppNotification(
          admin.id,
          `Gallery "${gallery.title}" by ${userName ?? 'an editor'} is ready for review.`,
          `/admin/gallery/${galleryId}/review`,
          'info',
          'Gallery Awaiting Review',
        ),
      ),
    )

    logger.info('GALLERY_SUBMITTED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/submit`,
      message:   `Gallery "${gallery.title}" submitted for review`,
      metadata:  { galleryId, title: gallery.title, adminCount: admins.length },
    })

    return NextResponse.json({ status: 'PENDING_REVIEW' })
  } catch (err) {
    logger.error('GALLERY_SUBMIT_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/submit`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error submitting gallery for review',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/submit PATCH`)
  }
}
