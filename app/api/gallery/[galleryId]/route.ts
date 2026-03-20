/**
 * GET /api/gallery/[galleryId]
 * Returns a single gallery with its sections and files.
 * Role filtering mirrors the list route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'

export async function GET(
  req: NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId } = session.user

    const gallery = await prisma.publicGallery.findUnique({
      where: { id: galleryId },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            files: {
              where:   { isVisible: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        createdBy:   { select: { id: true, name: true, email: true } },
        publishedBy: { select: { id: true, name: true } },
        _count:      { select: { views: true, downloads: true } },
      },
    })

    if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce role-based visibility
    const isOwner = gallery.createdById === userId
    if (
      role !== 'ADMIN' &&
      gallery.status !== 'PUBLISHED' &&
      !(role === 'EDITOR' && isOwner)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ gallery })
  } catch (err) {
    logger.error('GALLERY_FETCH_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error fetching gallery',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
