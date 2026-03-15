import { NextRequest, NextResponse }                           from 'next/server'
import { getServerSession }                                    from 'next-auth'
import { authOptions }                                         from '@/lib/auth'
import { prisma }                                              from '@/lib/prisma'
import { log }                                                 from '@/lib/activityLog'
import { notifyFileStatusChanged, notifyFilePublished }       from '@/lib/notifications'
import { sendFilePublishedEmail }                              from '@/lib/email'

/**
 * PATCH /api/media/[fileId]/status
 * Body: { newStatus: FileStatus }
 *
 * Role matrix
 * ──────────────────────────────────────────────────────
 *  UPLOADER  → forbidden (403)
 *  EDITOR    → may set: RAW | EDITING_IN_PROGRESS | EDITED | PUBLISHED
 *  ADMIN     → may set: RAW | EDITING_IN_PROGRESS | EDITED | PUBLISHED | ARCHIVED
 *
 * DELETED and PURGED are managed exclusively by the trash/purge system.
 * Attempting to move a DELETED/PURGED file via this endpoint returns 409.
 * ──────────────────────────────────────────────────────
 */

const EDITOR_STATUSES = new Set(['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED'])
const ADMIN_STATUSES  = new Set(['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED'])
const LOCKED_STATUSES = new Set(['DELETED', 'PURGED'])

export async function PATCH(
  req:     NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string

  // UPLOADERs may never change status
  if (role === 'UPLOADER') {
    return NextResponse.json(
      { error: 'Forbidden: UPLOADERs cannot change file status' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { newStatus } = body as { newStatus?: string }

  if (!newStatus) {
    return NextResponse.json({ error: 'Missing newStatus in request body' }, { status: 400 })
  }

  // Role capability check
  const allowed = role === 'ADMIN' ? ADMIN_STATUSES : EDITOR_STATUSES
  if (!allowed.has(newStatus)) {
    return NextResponse.json(
      { error: `${role} cannot set status to "${newStatus}"` },
      { status: 403 }
    )
  }

  // Load the current file
  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const oldStatus = file.status as string

  // Reject changes on deleted / purged files
  if (LOCKED_STATUSES.has(oldStatus)) {
    return NextResponse.json(
      { error: `Cannot change status on a ${oldStatus.toLowerCase()} file` },
      { status: 409 }
    )
  }

  // No-op guard
  if (oldStatus === newStatus) {
    return NextResponse.json({ error: 'File already has that status' }, { status: 400 })
  }

  // Apply update
  const updated = await prisma.mediaFile.update({
    where: { id: params.fileId },
    data:  { status: newStatus as any },
  })

  // Activity log — non-fatal
  await log('STATUS_CHANGED', session.user.id, {
    mediaFileId: file.id,
    eventId:     file.eventId,
    metadata: {
      fileName:  file.originalName,
      oldStatus,
      newStatus,
    },
  })

  // Notifications — fire-and-forget
  notifyFileStatusChanged({
    fileId:     file.id,
    fileName:   file.originalName,
    newStatus,
    actorId:    session.user.id,
    uploaderId: file.uploaderId,
  }).catch(() => {})

  if (newStatus === 'PUBLISHED') {
    // In-app + push for published
    notifyFilePublished({
      fileId:   file.id,
      fileName: file.originalName,
      actorId:  session.user.id,
    }).catch(() => {})

    // Email alert for published — send to ADMIN + EDITOR staff
    prisma.user.findMany({
      where:  {
        AND: [
          { id: { not: session.user.id } },
          { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
        ],
      },
      select: { id: true, email: true },
    }).then(async (staff) => {
      const recipientEmails: string[] = []
      for (const u of staff) {
        const pref = await prisma.notificationPreference.findUnique({
          where: { userId_category: { userId: u.id, category: 'FILE_PUBLISHED_ALERT' } },
        })
        if (!pref || pref.email) recipientEmails.push(u.email)
      }
      if (recipientEmails.length > 0) {
        const actor = session.user.username ?? session.user.name ?? session.user.email ?? 'Someone'
        const ev    = await prisma.event.findUnique({ where: { id: file.eventId }, select: { name: true } })
        sendFilePublishedEmail(recipientEmails, {
          fileName:    file.originalName,
          fileId:      file.id,
          eventName:   ev?.name,
          publishedBy: actor,
        }).catch(() => {})
      }
    }).catch(() => {})
  }

  return NextResponse.json({ ...updated, fileSize: updated.fileSize.toString() })
}
