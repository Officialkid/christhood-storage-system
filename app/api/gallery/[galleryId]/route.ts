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
import { ApiError, handleApiError }  from '@/lib/apiError'

export async function GET(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

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

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    // Enforce role-based visibility
    const isOwner = gallery.createdById === userId
    if (
      role !== 'ADMIN' &&
      gallery.status !== 'PUBLISHED' &&
      !(role === 'EDITOR' && isOwner)
    ) {
      throw new ApiError(403, "You don't have permission to view this gallery.")
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
    return handleApiError(err, `/api/gallery/${galleryId} GET`)
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to edit galleries.")
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, status: true, createdById: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')

    if (gallery.status === 'ARCHIVED') {
      throw new ApiError(409, 'Archived galleries cannot be edited.')
    }

    if (role === 'EDITOR' && gallery.createdById !== userId) {
      throw new ApiError(403, "You can only edit your own galleries.")
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
        throw new ApiError(409, 'That gallery link is already in use.')
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
    return handleApiError(err, `/api/gallery/${galleryId} PATCH`)
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
    if (!session?.user) throw new ApiError(401, 'Please log in to continue.')

    const { role, id: userId } = session.user
    if (role !== 'EDITOR' && role !== 'ADMIN') {
      throw new ApiError(403, "You don't have permission to delete galleries.")
    }

    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, title: true, status: true, createdById: true },
    })

    if (!gallery) throw new ApiError(404, 'Gallery not found.')
    if (gallery.status === 'DELETED' || gallery.status === 'PURGED') {
      throw new ApiError(409, 'This gallery is already in trash.')
    }

    // EDITOR: only own DRAFT galleries
    if (role === 'EDITOR') {
      if (gallery.createdById !== userId) {
        throw new ApiError(403, "You can only delete your own draft galleries.")
      }
      if (gallery.status !== 'DRAFT') {
        throw new ApiError(409, 'Editors can only delete draft galleries.')
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
    return handleApiError(err, `/api/gallery/${galleryId} DELETE`)
  }
}
