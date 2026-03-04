import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

// POST /api/admin/media/[fileId]/delete
// ADMIN only — moves a file to Trash (soft delete)
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                  return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN')   return NextResponse.json({ error: 'Forbidden'       }, { status: 403 })

  const { fileId } = params
  const adminId    = session.user.id

  // ── Load file ────────────────────────────────────────────────────────────
  const file = await prisma.mediaFile.findUnique({
    where:   { id: fileId },
    include: { trashItem: true },
  })

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
  // Cast as string: DELETED/PURGED are new enum values; safe once db push completes
  if ((file.status as string) === 'DELETED') {
    return NextResponse.json({ error: 'File is already in Trash' }, { status: 409 })
  }
  if ((file.status as string) === 'PURGED') {
    return NextResponse.json({ error: 'File has been permanently purged' }, { status: 410 })
  }

  const now             = new Date()
  const scheduledPurge  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days

  // ── Atomic: create TrashItem + update MediaFile status ───────────────────
  await prisma.$transaction([
    prisma.trashItem.create({
      data: {
        mediaFileId:      fileId,
        deletedById:      adminId,
        deletedAt:        now,
        scheduledPurgeAt: scheduledPurge,
        preDeleteStatus:  file.status,
      } as any, // preDeleteStatus is a new field; fully typed after db push + ts restart
    }),
    prisma.mediaFile.update({
      where: { id: fileId },
      data:  { status: 'DELETED' as any }, // DELETED is a new FileStatus value
    }),
  ])

  // ── Log ───────────────────────────────────────────────────────────────────
  await log('FILE_DELETED', adminId, {
    mediaFileId: fileId,
    eventId:     file.eventId,
    metadata: {
      fileName:        file.originalName,
      storedName:      file.storedName,
      preDeleteStatus: file.status,
      scheduledPurgeAt: scheduledPurge.toISOString(),
    },
  })

  return NextResponse.json({
    message:          'File moved to Trash',
    scheduledPurgeAt: scheduledPurge.toISOString(),
  })
}
