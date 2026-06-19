/**
 * PATCH /api/gallery/[galleryId]/archive
 * Archives a PUBLISHED gallery → ARCHIVED.
 * ADMIN ONLY.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { createInAppNotification }   from '@/lib/notifications'
import { ApiError, handleApiError }  from '@/lib/apiError'

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user

    if (role !== 'ADMIN') {
      throw new ApiError(403, 'Only admins can archive galleries.')
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, status: true, createdById: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    if (gallery.status !== 'PUBLISHED') {
      throw new ApiError(409, `Only published galleries can be archived. Current status: ${gallery.status}.`)
    }

    await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  { status: 'ARCHIVED' },
    })

    // Notify creator
    await createInAppNotification(
      gallery.createdById,
      `Your gallery "${gallery.title}" has been archived and is no longer publicly visible.`,
      undefined,
      'warning',
      'Gallery Archived',
    )

    logger.info('GALLERY_ARCHIVED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/archive`,
      message:   `Gallery "${gallery.title}" archived`,
      metadata:  { galleryId, title: gallery.title },
    })

    return NextResponse.json({ status: 'ARCHIVED' })
  } catch (err) {
    logger.error('GALLERY_ARCHIVE_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/archive`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error archiving gallery',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/archive PATCH`)
  }
}
