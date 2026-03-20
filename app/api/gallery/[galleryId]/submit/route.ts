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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId, name: userName } = session.user

    // Only EDITOR can submit (admins review/publish directly)
    if (role !== 'EDITOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, slug: true, status: true, createdById: true, totalPhotos: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })

    if (gallery.createdById !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (gallery.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Gallery must be in DRAFT status to submit (current: ${gallery.status})` },
        { status: 409 },
      )
    }

    if ((gallery.totalPhotos ?? 0) < 1) {
      return NextResponse.json(
        { error: 'Gallery must have at least one photo before submitting for review' },
        { status: 422 },
      )
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
