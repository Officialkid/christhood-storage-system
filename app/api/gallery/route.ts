/**
 * GET /api/gallery
 * Lists galleries, filtered by role.
 *   ADMIN  → all galleries (all statuses)
 *   EDITOR → own galleries (all statuses) + all PUBLISHED
 *   UPLOADER → PUBLISHED only
 *
 * Query params: status, year, categoryName, page (1-based), limit (default 20)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { withLogging }               from '@/lib/api-handler'

async function handler(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { role, id: userId } = session.user

  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status') ?? undefined
  const year         = searchParams.get('year')   ? Number(searchParams.get('year'))  : undefined
  const categoryName = searchParams.get('categoryName') ?? undefined
  const page         = Math.max(1, Number(searchParams.get('page')  ?? 1))
  const limit        = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const skip         = (page - 1) * limit

  // Build where clause based on role
  let where: Record<string, unknown>

  if (role === 'ADMIN') {
    where = {}
  } else if (role === 'EDITOR') {
    where = {
      OR: [
        { createdById: userId },
        { status: 'PUBLISHED' },
      ],
    }
  } else {
    // UPLOADER or any other role
    where = { status: 'PUBLISHED' }
  }

  if (status)       where.status       = status
  if (year)         where.year         = year
  if (categoryName) where.categoryName = categoryName

  const [galleries, total] = await Promise.all([
    prisma.publicGallery.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count:      { select: { sections: true, files: true } },
        createdBy:   { select: { id: true, name: true, email: true } },
        publishedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.publicGallery.count({ where }),
  ])

  return NextResponse.json({
    galleries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}

export const GET = withLogging('/api/gallery', handler)
