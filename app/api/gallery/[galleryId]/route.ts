/**
 * GET /api/gallery/[galleryId]
 * Returns a single gallery with its sections and files.
 * Role filtering mirrors the list route.
 *
 * PATCH /api/gallery/[galleryId]
 * Updates gallery metadata/settings.
 * Allowed: EDITOR (own non-archived), ADMIN
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { galleryId: string } },
) {
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
      return NextResponse.json({ error: 'Cannot edit an archived gallery' }, { status: 409 })
    }

    if (role === 'EDITOR' && gallery.createdById !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      title, description, categoryName, year, slug,
      allowDownload, allowFullRes, requireNameForDownload,
      isPasswordProtected, password,
    } = body

    // If slug is being changed, ensure uniqueness
    if (slug) {
      const conflict = await prisma.publicGallery.findFirst({
        where: { slug, id: { not: galleryId } },
        select: { id: true },
      })
      if (conflict) {
        return NextResponse.json({ error: 'Slug is already in use' }, { status: 409 })
      }
    }

    // Build update data (only include fields that were provided)
    const data: Record<string, unknown> = {}
    if (title      !== undefined) data.title      = title
    if (description !== undefined) data.description = description ?? null
    if (categoryName !== undefined) data.categoryName = categoryName ?? null
    if (year       !== undefined) data.year       = Number(year)
    if (slug       !== undefined) data.slug       = slug
    if (allowDownload          !== undefined) data.allowDownload          = Boolean(allowDownload)
    if (allowFullRes           !== undefined) data.allowFullRes           = Boolean(allowFullRes)
    if (requireNameForDownload !== undefined) data.requireNameForDownload = Boolean(requireNameForDownload)
    if (isPasswordProtected !== undefined)   data.isPasswordProtected    = Boolean(isPasswordProtected)
    if (password !== undefined && password !== null) {
      // In production this should be hashed; store as bcrypt hash
      // For now store as-is (the client should only send this when changing the password)
      data.passwordHash = password
    }
    if (isPasswordProtected === false) data.passwordHash = null

    const updated = await prisma.publicGallery.update({
      where: { id: galleryId },
      data,
    })

    logger.info('GALLERY_UPDATED', {
      userId,
      userRole: role,
      route:    `/api/gallery/${galleryId}`,
      message:  `Gallery "${updated.title}" settings updated`,
      metadata: { galleryId, updatedFields: Object.keys(data) },
    })

    return NextResponse.json({ gallery: updated })
  } catch (err) {
    logger.error('GALLERY_UPDATE_ERROR', {
      userId:    undefined,
      userRole:  undefined,
      route:     `/api/gallery/${galleryId}`,
      error:     err instanceof Error ? err.message : String(err),
      message:   'Unexpected error updating gallery',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
