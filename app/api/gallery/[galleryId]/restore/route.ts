/**
 * POST /api/gallery/[galleryId]/restore
 * Admin only — restores a soft-deleted gallery back to its pre-deletion status.
 * The gallery's R2 files were never touched, so no storage recovery is needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { log }                       from '@/lib/activityLog'
import { ApiError, handleApiError }  from '@/lib/apiError'

export async function POST(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'ADMIN') {
      throw new ApiError(403, 'Only admins can restore galleries.')
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, status: true, preDeleteStatus: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')
    if (gallery.status !== 'DELETED') {
      throw new ApiError(409, 'This gallery is not currently in trash.')
    }

    const restoredStatus = gallery.preDeleteStatus ?? 'DRAFT'

    const restored = await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  {
        status:          restoredStatus,
        deletedAt:       null,
        deletedById:     null,
        purgesAt:        null,
        preDeleteStatus: null,
      },
    })

    await log('GALLERY_RESTORED', userId, {
      metadata: {
        galleryId,
        galleryTitle:    gallery.title,
        restoredStatus,
      },
    })

    logger.info('GALLERY_RESTORED', {
      userId,
      userRole: role,
      route:    `/api/gallery/${galleryId}/restore`,
      message:  `Gallery "${gallery.title}" restored to ${restoredStatus}`,
      metadata: { galleryId, restoredStatus },
    })

    return NextResponse.json({ success: true, gallery: restored })
  } catch (err) {
    logger.error('GALLERY_RESTORE_ERROR', {
      userId:   undefined,
      userRole: undefined,
      route:    `/api/gallery/${galleryId}/restore`,
      error:    err instanceof Error ? err.message : String(err),
      message:  'Unexpected error restoring gallery',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/restore POST`)
  }
}
