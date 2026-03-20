/**
 * DELETE /api/gallery/[galleryId]/files/[fileId]
 * Removes a photo from a gallery and deletes its R2 objects.
 *
 * PATCH /api/gallery/[galleryId]/files/[fileId]
 * Toggles file visibility or updates sortOrder.
 *
 * Allowed: EDITOR (own galleries), ADMIN
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { deleteFromGallery }         from '@/lib/gallery/gallery-r2'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { galleryId: string; fileId: string } },
) {
  const { galleryId, fileId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, status: true, createdById: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })

    if (gallery.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot modify an archived gallery' }, { status: 409 })
    }

    if (role === 'EDITOR' && gallery.createdById !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const galleryFile = await prisma.galleryFile.findFirst({
      where:  { id: fileId, galleryId },
      select: { id: true, thumbnailKey: true, previewKey: true, originalKey: true, sectionId: true },
    })

    if (!galleryFile) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    // Delete R2 objects (non-fatal if some fail — log and continue)
    const r2Keys = [
      galleryFile.thumbnailKey,
      galleryFile.previewKey,
      galleryFile.originalKey,
    ].filter(Boolean) as string[]

    await Promise.allSettled(r2Keys.map(key => deleteFromGallery(key)))

    // Delete DB record and update counters in a transaction
    await prisma.$transaction([
      prisma.galleryFile.delete({ where: { id: fileId } }),
      prisma.publicGallery.update({
        where: { id: galleryId },
        data:  { totalPhotos: { decrement: 1 } },
      }),
      ...(galleryFile.sectionId ? [
        prisma.gallerySection.update({
          where: { id: galleryFile.sectionId },
          data:  { photoCount: { decrement: 1 } },
        }),
      ] : []),
    ])

    logger.info('GALLERY_PHOTO_REMOVED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/files/${fileId}`,
      fileId,
      message:   'Photo removed from gallery',
      metadata:  { galleryId },
    })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error('GALLERY_FILE_DELETE_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/files/${fileId}`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error removing gallery photo',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { galleryId: string; fileId: string } },
) {
  const { galleryId, fileId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, status: true, createdById: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })
    if (gallery.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot modify an archived gallery' }, { status: 409 })
    }
    if (role === 'EDITOR' && gallery.createdById !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.isVisible  !== undefined) data.isVisible  = Boolean(body.isVisible)
    if (body.sortOrder  !== undefined) data.sortOrder  = Number(body.sortOrder)

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await prisma.galleryFile.update({
      where: { id: fileId },
      data,
    })

    return NextResponse.json({ file: updated })
  } catch (err) {
    logger.error('GALLERY_FILE_PATCH_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/files/${fileId}`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error updating gallery file',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
