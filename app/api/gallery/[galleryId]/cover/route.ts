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

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

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
    const { fileId } = body

    if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 })

    const galleryFile = await prisma.galleryFile.findFirst({
      where:  { id: fileId, galleryId, isVisible: true },
      select: { thumbnailKey: true },
    })

    if (!galleryFile) {
      return NextResponse.json({ error: 'File not found in this gallery' }, { status: 404 })
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
