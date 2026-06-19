/**
 * DELETE /api/admin/gallery-trash/[galleryId]
 * Admin only — immediately and permanently purges a deleted gallery:
 *   1. Deletes all R2 objects (thumbnail + preview + original per file, cover)
 *   2. Deletes GalleryView, GalleryDownload, GalleryFile, GallerySection rows
 *   3. Sets PublicGallery.status = 'PURGED' (keeps the record for audit)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { ApiError, handleApiError }  from '@/lib/apiError'
import { prisma }                    from '@/lib/prisma'
import { deleteFromGallery }         from '@/lib/gallery/gallery-r2'
import { logger }                    from '@/lib/logger'
import { log }                       from '@/lib/activityLog'

export async function DELETE(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')
    if (session.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Only admins can permanently delete galleries.')
    }

    const { id: userId } = session.user

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: {
        id:           true,
        title:        true,
        status:       true,
        coverImageKey: true,
        files: { select: { thumbnailKey: true, previewKey: true, originalKey: true } },
      },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')
    if (gallery.status !== 'DELETED') {
      throw new ApiError(409, 'This gallery is not currently in trash.')
    }

    // 1. Collect all R2 keys and delete them
    const r2Keys: string[] = []
    for (const file of gallery.files) {
      r2Keys.push(file.thumbnailKey, file.previewKey, file.originalKey)
    }
    if (gallery.coverImageKey) r2Keys.push(gallery.coverImageKey)

    const r2Results = await Promise.allSettled(r2Keys.map(key => deleteFromGallery(key)))
    const r2Failed  = r2Results.filter(r => r.status === 'rejected').length
    if (r2Failed > 0) {
      logger.warn('GALLERY_PURGE_R2_PARTIAL', {
        route:    `/api/admin/gallery-trash/${galleryId}`,
        message:  `${r2Failed}/${r2Keys.length} R2 objects failed to delete`,
        metadata: { galleryId },
      })
    }

    // 2. Delete child DB records and mark gallery as PURGED (keep the row)
    await prisma.$transaction([
      prisma.galleryView.deleteMany(    { where: { galleryId } }),
      prisma.galleryDownload.deleteMany({ where: { galleryId } }),
      prisma.galleryFile.deleteMany(    { where: { galleryId } }),
      prisma.gallerySection.deleteMany( { where: { galleryId } }),
      prisma.publicGallery.update({
        where: { id: galleryId },
        data:  { status: 'PURGED' },
      }),
    ])

    await log('GALLERY_PURGED', userId, {
      metadata: { galleryId, galleryTitle: gallery.title, fileCount: gallery.files.length },
    })

    logger.info('GALLERY_PURGED', {
      userId,
      userRole: 'ADMIN',
      route:    `/api/admin/gallery-trash/${galleryId}`,
      message:  `Gallery "${gallery.title}" permanently purged`,
      metadata: { galleryId, fileCount: gallery.files.length, r2Keys: r2Keys.length },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('GALLERY_PURGE_ERROR', {
      route:   `/api/admin/gallery-trash/${galleryId}`,
      error:   err instanceof Error ? err.message : String(err),
      message: 'Unexpected error purging gallery',
    })
    return handleApiError(err, `admin/gallery-trash/${galleryId} DELETE`)
  }
}
