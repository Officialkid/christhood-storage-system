/**
 * PATCH /api/gallery/[galleryId]/cover
 * Sets the cover image for a gallery to the thumbnail of an existing file.
 * Allowed: EDITOR (own galleries), ADMIN
 * Body: { fileId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { ApiError, handleApiError }  from '@/lib/apiError'

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to update gallery covers.")
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, status: true, createdById: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    if (gallery.status === 'ARCHIVED') {
      throw new ApiError(409, 'Archived galleries cannot be edited.')
    }

    if (role === 'EDITOR' && gallery.createdById !== userId) {
      throw new ApiError(403, "You can only edit your own galleries.")
    }

    const body = await req.json()
    const { fileId } = body

    if (!fileId) throw new ApiError(400, 'Choose a photo to use as the gallery cover.')

    const galleryFile = await prisma.galleryFile.findFirst({
      where:  { id: fileId, galleryId, isVisible: true },
      select: { thumbnailKey: true },
    })

    if (!galleryFile) {
      throw new ApiError(404, 'That visible photo could not be found in this gallery.')
    }

    await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  { coverImageKey: galleryFile.thumbnailKey },
    })

    logger.info('GALLERY_COVER_SET', {
      userId,
      userRole:     role,
      route:        `/api/gallery/${galleryId}/cover`,
      fileId,
      message:      'Gallery cover image updated',
      metadata:     { galleryId, coverImageKey: galleryFile.thumbnailKey },
    })

    return NextResponse.json({ coverImageKey: galleryFile.thumbnailKey })
  } catch (err) {
    logger.error('GALLERY_COVER_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/cover`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error setting gallery cover',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/cover PATCH`)
  }
}
