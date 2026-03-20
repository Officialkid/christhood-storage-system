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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId } = session.user

    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, status: true, createdById: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })

    if (gallery.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: `Gallery must be in PUBLISHED status to archive (current: ${gallery.status})` },
        { status: 409 },
      )
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
