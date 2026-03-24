/**
 * POST /api/gallery/[galleryId]/sections
 * Adds a new section to a gallery.
 * Allowed: EDITOR (own DRAFT galleries only), ADMIN
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'

export async function POST(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
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

    // EDITOR can only modify their own, non-published galleries
    if (role === 'EDITOR') {
      if (gallery.createdById !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (gallery.status === 'ARCHIVED') {
        return NextResponse.json({ error: 'Cannot add sections to an archived gallery' }, { status: 409 })
      }
    }

    const body = await req.json()
    const { title, date, sortOrder } = body

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const section = await prisma.gallerySection.create({
      data: {
        galleryId,
        title,
        date:      date       ? new Date(date) : null,
        sortOrder: sortOrder  ?? 0,
      },
    })

    logger.info('GALLERY_SECTION_CREATED', {
      userId,
      userRole:  role,
      route:     `/api/gallery/${galleryId}/sections`,
      message:   `Section "${section.title}" added to gallery`,
      metadata:  { galleryId, sectionId: section.id },
    })

    return NextResponse.json({ section }, { status: 201 })
  } catch (err) {
    logger.error('GALLERY_SECTION_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}/sections`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error creating gallery section',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
