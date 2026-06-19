/**
 * PATCH /api/gallery/[galleryId]/sections/[sectionId]  — update title / date / sortOrder
 * DELETE /api/gallery/[galleryId]/sections/[sectionId] — remove section + its files
 *
 * Allowed: EDITOR (own), ADMIN
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { deleteFromGallery }         from '@/lib/gallery/gallery-r2'
import { ApiError, handleApiError }  from '@/lib/apiError'

async function authorise(galleryId: string, userId: string, role: string) {
  const gallery = await prisma.publicGallery.findUnique({
    where:  { id: galleryId },
    select: { id: true, status: true, createdById: true },
  })
  if (!gallery) return { error: 'Gallery not found.', status: 404 }
  if (gallery.status === 'ARCHIVED') return { error: 'Archived galleries cannot be edited.', status: 409 }
  if (role === 'EDITOR' && gallery.createdById !== userId) return { error: "You can only update your own galleries.", status: 403 }
  return { gallery }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ galleryId: string; sectionId: string }> }
) {
  const params = await props.params;
  const { galleryId, sectionId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to edit gallery sections.")
    }

    const auth = await authorise(galleryId, userId, role)
    if ('error' in auth) {
      const status = auth.status ?? 500
      const message = auth.error ?? 'Unable to update this gallery section.'
      throw new ApiError(status, message)
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.title     !== undefined) data.title     = body.title
    if (body.date      !== undefined) data.date      = body.date ? new Date(body.date) : null
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder)

    if (!Object.keys(data).length) {
      throw new ApiError(400, 'No section changes were provided.')
    }

    const updated = await prisma.gallerySection.update({
      where: { id: sectionId },
      data,
    })

    return NextResponse.json({ section: updated })
  } catch (err) {
    logger.error('GALLERY_SECTION_PATCH_ERROR', {
      route:   `/api/gallery/${galleryId}/sections/${sectionId}`,
      error:   err instanceof Error ? err.message : String(err),
      message: 'Unexpected error updating gallery section',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/sections/${sectionId} PATCH`)
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ galleryId: string; sectionId: string }> }
) {
  const params = await props.params;
  const { galleryId, sectionId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to delete gallery sections.")
    }

    const auth = await authorise(galleryId, userId, role)
    if ('error' in auth) {
      const status = auth.status ?? 500
      const message = auth.error ?? 'Unable to delete this gallery section.'
      throw new ApiError(status, message)
    }

    // Fetch all files in this section so we can delete from R2
    const files = await prisma.galleryFile.findMany({
      where:  { sectionId },
      select: { thumbnailKey: true, previewKey: true, originalKey: true },
    })

    // Delete R2 objects non-fatally
    const keys = files.flatMap(f => [f.thumbnailKey, f.previewKey, f.originalKey]).filter(Boolean) as string[]
    await Promise.allSettled(keys.map(k => deleteFromGallery(k)))

    // Delete section (cascade deletes GalleryFile records)
    await prisma.gallerySection.delete({ where: { id: sectionId } })

    // Update gallery photo count
    if (files.length > 0) {
      await prisma.publicGallery.update({
        where: { id: galleryId },
        data:  { totalPhotos: { decrement: files.length } },
      })
    }

    logger.info('GALLERY_SECTION_DELETED', {
      userId,
      userRole: role,
      route:    `/api/gallery/${galleryId}/sections/${sectionId}`,
      message:  'Gallery section deleted',
      metadata: { galleryId, sectionId, filesRemoved: files.length },
    })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error('GALLERY_SECTION_DELETE_ERROR', {
      route:   `/api/gallery/${galleryId}/sections/${sectionId}`,
      error:   err instanceof Error ? err.message : String(err),
      message: 'Unexpected error deleting gallery section',
    })
    return handleApiError(err, `/api/gallery/${galleryId}/sections/${sectionId} DELETE`)
  }
}
