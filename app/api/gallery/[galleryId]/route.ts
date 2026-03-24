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
import bcrypt                        from 'bcryptjs'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { log }                       from '@/lib/activityLog'

export async function GET(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
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
      // Hash the password before storing — never persist plaintext credentials
      data.passwordHash = await bcrypt.hash(String(password).slice(0, 100), 10)
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

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/gallery/[galleryId]
// Soft-deletes a gallery: sets status=DELETED, deletedAt/By, purgesAt (+30d),
// and preDeleteStatus so it can be fully restored.
//   ADMIN  → can trash any non-deleted/purged gallery
//   EDITOR → can only trash their own DRAFT galleries
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
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
      select: { id: true, title: true, status: true, createdById: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })
    if (gallery.status === 'DELETED' || gallery.status === 'PURGED') {
      return NextResponse.json({ error: 'Gallery is already deleted' }, { status: 409 })
    }

    // EDITOR: only own DRAFT galleries
    if (role === 'EDITOR') {
      if (gallery.createdById !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (gallery.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'Editors can only delete DRAFT galleries' },
          { status: 409 },
        )
      }
    }

    const now      = new Date()
    const purgesAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    await prisma.publicGallery.update({
      where: { id: galleryId },
      data:  {
        status:          'DELETED',
        deletedAt:       now,
        deletedById:     userId,
        purgesAt,
        preDeleteStatus: gallery.status,
      },
    })

    await log('GALLERY_DELETED', userId, {
      metadata: {
        galleryId,
        galleryTitle: gallery.title,
        purgesAt:     purgesAt.toISOString(),
        preStatus:    gallery.status,
      },
    })

    logger.info('GALLERY_DELETED', {
      userId,
      userRole: role,
      route:    `/api/gallery/${galleryId}`,
      message:  `Gallery "${gallery.title}" moved to trash — purges ${purgesAt.toISOString()}`,
      metadata: { galleryId, purgesAt: purgesAt.toISOString() },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('GALLERY_DELETE_ERROR', {
      userId:   undefined,
      userRole: undefined,
      route:    `/api/gallery/${galleryId}`,
      error:    err instanceof Error ? err.message : String(err),
      message:  'Unexpected error deleting gallery',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
