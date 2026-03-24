/**
 * GET /api/admin/gallery-trash
 * Admin only — lists galleries with status=DELETED, paginated.
 *
 * Query params: page (1-based), limit (default 20, max 50)
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getGalleryPublicUrl }        from '@/lib/gallery/gallery-r2'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))
    const skip  = (page - 1) * limit

    const [galleries, total] = await prisma.$transaction([
      prisma.publicGallery.findMany({
        where:   { status: 'DELETED' },
        orderBy: { deletedAt: 'desc' },
        skip,
        take:    limit,
        select: {
          id:              true,
          slug:            true,
          title:           true,
          coverImageKey:   true,
          status:          true,
          totalPhotos:     true,
          categoryName:    true,
          year:            true,
          deletedAt:       true,
          purgesAt:        true,
          preDeleteStatus: true,
          deletedBy:       { select: { id: true, username: true, email: true } },
          _count:          { select: { files: true } },
        },
      }),
      prisma.publicGallery.count({ where: { status: 'DELETED' } }),
    ])

    const items = galleries.map(g => ({
      id:              g.id,
      slug:            g.slug,
      title:           g.title,
      coverUrl:        g.coverImageKey ? getGalleryPublicUrl(g.coverImageKey) : null,
      status:          g.status,
      totalPhotos:     g.totalPhotos,
      categoryName:    g.categoryName,
      year:            g.year,
      fileCount:       g._count.files,
      deletedAt:       g.deletedAt?.toISOString() ?? '',
      purgesAt:        g.purgesAt?.toISOString()  ?? '',
      preDeleteStatus: g.preDeleteStatus,
      deletedBy:       g.deletedBy ?? { id: '', username: null, email: '' },
    }))

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
