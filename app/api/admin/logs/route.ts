import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { Prisma }                    from '@prisma/client'

/**
 * GET /api/admin/logs
 *
 * Query params (all optional):
 *   action, userId, eventId, mediaFileId
 *   from (ISO date string), to (ISO date string)
 *   q (free-text search on action string)
 *   page (default 1), limit (default 50, max 200)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)

  const action      = searchParams.get('action')      ?? undefined
  const userId      = searchParams.get('userId')      ?? undefined
  const eventId     = searchParams.get('eventId')     ?? undefined
  const mediaFileId = searchParams.get('mediaFileId') ?? undefined
  const from        = searchParams.get('from')        ?? undefined
  const to          = searchParams.get('to')          ?? undefined
  const q           = searchParams.get('q')           ?? undefined
  const page        = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit       = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50')))

  const where: Prisma.ActivityLogWhereInput = {
    ...(action      ? { action }      : {}),
    ...(userId      ? { userId }      : {}),
    ...(eventId     ? { eventId }     : {}),
    ...(mediaFileId ? { mediaFileId } : {}),
    ...(q           ? { action: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(from || to  ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
      },
    } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
        mediaFile: {
          select: { id: true, originalName: true, storedName: true, fileType: true },
        },
        event: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.activityLog.count({ where }),
  ])

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}
