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
import { ApiError, handleApiError }  from '@/lib/apiError'

export async function POST(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to add gallery sections.")
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, status: true, createdById: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    // EDITOR can only modify their own, non-published galleries
    if (role === 'EDITOR') {
      if (gallery.createdById !== userId) {
        throw new ApiError(403, "You can only update your own galleries.")
      }
      if (gallery.status === 'ARCHIVED') {
        throw new ApiError(409, 'Archived galleries cannot be edited.')
      }
    }

    const body = await req.json()
    const { title, date, sortOrder } = body

    if (!title) throw new ApiError(400, 'Section title is required.')

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
    return handleApiError(err, `/api/gallery/${galleryId}/sections POST`)
  }
}
