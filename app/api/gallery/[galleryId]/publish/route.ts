/**
 * PATCH /api/gallery/[galleryId]/publish
 * Publishes a PENDING_REVIEW gallery → PUBLISHED.
 * ADMIN ONLY.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { logger }                     from '@/lib/logger'
import { createInAppNotification }    from '@/lib/notifications'

const GALLERY_PUBLIC_BASE = 'https://gallery.cmmschristhood.org'

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
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
      select: {
        id: true, title: true, slug: true, status: true,
        createdById: true, totalPhotos: true,
      },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })

    if (gallery.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        { error: `Gallery must be in PENDING_REVIEW status to publish (current: ${gallery.status})` },
        { status: 409 },
      )
    }

    const visiblePhotos = await prisma.galleryFile.count({
      where: { galleryId, isVisible: true },
    })

    if (visiblePhotos < 1) {
      return NextResponse.json(
        { error: 'Gallery must have at least one visible photo before publishing' },
        { status: 422 },
      )
    }

    const updated = await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  {
        status:        'PUBLISHED',
        publishedById: userId,
        publishedAt:   new Date(),
      },
      select: { id: true, slug: true, title: true, publishedAt: true },
    })

    const galleryUrl = `${GALLERY_PUBLIC_BASE}/${updated.slug}`

    // Notify the gallery creator
    await createInAppNotification(
      gallery.createdById,
      `Your gallery "${gallery.title}" has been published and is now live.`,
      galleryUrl,
      'success',
      'Gallery Published',
    )

    logger.info('GALLERY_PUBLISHED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/publish`,
      message:   `Gallery "${updated.title}" published`,
      metadata:  { galleryId, slug: updated.slug, title: updated.title, url: galleryUrl },
    })

    return NextResponse.json({
      status:      'PUBLISHED',
      publishedAt: updated.publishedAt,
      url:         galleryUrl,
    })
  } catch (err) {
    logger.error('GALLERY_PUBLISH_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/publish`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error publishing gallery',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
