import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

/**
 * POST /api/admin/archive
 *
 * Manually archive or un-archive a single file.
 * Admin only.
 *
 * Body: { fileId: string, action: 'archive' | 'unarchive' }
 *
 * - archive:   status → ARCHIVED, records preArchiveStatus + archivedAt
 * - unarchive: status → preArchiveStatus (or EDITED if unknown), clears archivedAt
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const body = await req.json() as { fileId?: string; action?: string }
  const { fileId, action } = body

  if (!fileId || (action !== 'archive' && action !== 'unarchive')) {
    return NextResponse.json({ error: 'fileId and action (archive|unarchive) are required' }, { status: 400 })
  }

  const file = await prisma.mediaFile.findUnique({
    where: { id: fileId },
    select: {
      id: true, status: true, originalName: true,
      eventId: true, preArchiveStatus: true,
    },
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Guard against operating on deleted/purged files
  if (file.status === 'DELETED' || file.status === 'PURGED') {
    return NextResponse.json({ error: 'Cannot archive/unarchive a deleted or purged file' }, { status: 422 })
  }

  const now = new Date()

  if (action === 'archive') {
    if (file.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'File is already archived' }, { status: 409 })
    }

    await prisma.mediaFile.update({
      where: { id: fileId },
      data: {
        status:            'ARCHIVED',
        preArchiveStatus:  file.status as any,
        archivedAt:        now,
      },
    })

    await log('FILE_ARCHIVED', session.user.id, {
      mediaFileId: fileId,
      eventId:     file.eventId,
      metadata: {
        fileName:       file.originalName,
        previousStatus: file.status,
        auto:           false,
      },
    })

    return NextResponse.json({ ok: true, status: 'ARCHIVED', archivedAt: now.toISOString() })
  }

  // action === 'unarchive'
  if (file.status !== 'ARCHIVED') {
    return NextResponse.json({ error: 'File is not archived' }, { status: 409 })
  }

  const restoredStatus = (file.preArchiveStatus as string | null) ?? 'EDITED'

  await prisma.mediaFile.update({
    where: { id: fileId },
    data: {
      status:            restoredStatus as any,
      preArchiveStatus:  null,
      archivedAt:        null,
    },
  })

  await log('FILE_UNARCHIVED', session.user.id, {
    mediaFileId: fileId,
    eventId:     file.eventId,
    metadata: {
      fileName:       file.originalName,
      restoredStatus,
    },
  })

  return NextResponse.json({ ok: true, status: restoredStatus })
}
