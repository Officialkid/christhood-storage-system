import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/admin/find-duplicates
 *
 * Returns all active MediaFile records that share the same originalName within
 * the same event (grouped). Admin-only.
 *
 * Response:
 *   { groups: {
 *       originalName: string
 *       eventId:      string
 *       eventName:    string
 *       count:        number
 *       files: {
 *         id:           string
 *         storedName:   string
 *         fileSize:     string
 *         uploadedAt:   string
 *         uploaderName: string
 *       }[]
 *     }[] }
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Group files by (originalName, eventId) where more than one active copy exists
  const grouped = await prisma.mediaFile.groupBy({
    by:    ['originalName', 'eventId'],
    where: { status: { notIn: ['DELETED', 'PURGED'] } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    orderBy: { _count: { id: 'desc' } },
  })

  if (grouped.length === 0) {
    return NextResponse.json({ groups: [] })
  }

  // Fetch the actual file records + event names in parallel
  const [files, events] = await Promise.all([
    prisma.mediaFile.findMany({
      where: {
        OR: grouped.map(g => ({ originalName: g.originalName, eventId: g.eventId })),
        status: { notIn: ['DELETED', 'PURGED'] },
      },
      select: {
        id:          true,
        originalName: true,
        storedName:  true,
        fileSize:    true,
        eventId:     true,
        createdAt:   true,
        uploader:    { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.event.findMany({
      where: { id: { in: [...new Set(grouped.map(g => g.eventId))] } },
      select: { id: true, name: true },
    }),
  ])

  const eventMap = new Map(events.map(e => [e.id, e.name]))

  // Build groups
  const groups = grouped.map(g => {
    const groupFiles = files.filter(
      f => f.originalName === g.originalName && f.eventId === g.eventId,
    )
    return {
      originalName: g.originalName,
      eventId:      g.eventId,
      eventName:    eventMap.get(g.eventId) ?? g.eventId,
      count:        g._count.id,
      files:        groupFiles.map(f => ({
        id:           f.id,
        storedName:   f.storedName,
        fileSize:     f.fileSize.toString(),
        uploadedAt:   f.createdAt.toISOString(),
        uploaderName: f.uploader?.name ?? 'Unknown',
      })),
    }
  })

  return NextResponse.json({ groups })
}

/**
 * POST /api/admin/find-duplicates
 *
 * Resolves a duplicate group by trashing all but the designated "keeper".
 *
 * Body:
 *   { originalName, eventId, keepId: string, reason?: 'keep-newest' | 'keep-oldest' | 'manual' }
 *
 * Moves the extra files to trash (sets status=DELETED, creates TrashItem).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    originalName?: string
    eventId?:      string
    keepId?:       string
    reason?:       string
  }

  const { originalName, eventId, keepId, reason = 'manual' } = body
  if (!originalName || !eventId || !keepId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Find all non-kept duplicates
  const extras = await prisma.mediaFile.findMany({
    where: {
      originalName,
      eventId,
      status:  { notIn: ['DELETED', 'PURGED'] },
      id:      { not: keepId },
    },
    select: { id: true, status: true },
  })

  if (extras.length === 0) {
    return NextResponse.json({ trashed: 0 })
  }

  const scheduledPurgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await prisma.$transaction(async tx => {
    for (const extra of extras) {
      await tx.mediaFile.update({
        where: { id: extra.id },
        data:  { status: 'DELETED' },
      })
      // Create TrashItem if it doesn't already exist
      await tx.trashItem.upsert({
        where:  { mediaFileId: extra.id },
        create: {
          mediaFileId:      extra.id,
          deletedById:      session.user.id,
          scheduledPurgeAt,
          preDeleteStatus:  extra.status as any,
        },
        update: {},
      })
      await tx.activityLog.create({
        data: {
          action:      'FILE_DUPLICATE_TRASHED',
          userId:      session.user.id,
          mediaFileId: extra.id,
          eventId,
          metadata: { originalName, keepId, reason },
        },
      })
    }
  })

  return NextResponse.json({ trashed: extras.length })
}
