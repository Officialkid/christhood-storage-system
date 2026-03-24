import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import { logger }                    from '@/lib/logger'

// DELETE /api/files/[fileId]
// Soft-deletes a file by moving it to Trash. Accessible by EDITOR and ADMIN.
//
// Permission rules:
//   UPLOADER : forbidden
//   EDITOR   : can delete their own files (any non-PUBLISHED status)
//              can delete other users' files only when status is RAW
//              cannot delete PUBLISHED files
//   ADMIN    : can delete any file (extra warning shown in UI for PUBLISHED)
export async function DELETE(_req: NextRequest, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const role   = session.user.role as string
  const userId = session.user.id

  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Uploaders cannot delete files.' }, { status: 403 })
  }

  const { fileId } = params

  const file = await prisma.mediaFile.findUnique({
    where:   { id: fileId },
    include: { trashItem: true },
  })

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const status = file.status as string

  if (status === 'DELETED' || file.trashItem) {
    return NextResponse.json({ error: 'File is already in Trash' }, { status: 409 })
  }
  if (status === 'PURGED') {
    return NextResponse.json({ error: 'File has been permanently purged' }, { status: 410 })
  }

  // ── Editor permission gate ────────────────────────────────────────────────
  if (role === 'EDITOR') {
    if (status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Published files cannot be deleted. Change the status first.' },
        { status: 403 },
      )
    }
    if (file.uploaderId !== userId && status !== 'RAW') {
      return NextResponse.json(
        { error: "You can only delete another user's file when its status is still RAW." },
        { status: 403 },
      )
    }
  }

  const now            = new Date()
  const scheduledPurge = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days

  // ── Atomic: create TrashItem + update MediaFile ───────────────────────────
  let trashItemId: string
  try {
    trashItemId = await prisma.$transaction(async (tx) => {
      const item = await tx.trashItem.create({
        data: {
          mediaFileId:      fileId,
          deletedById:      userId,
          deletedAt:        now,
          scheduledPurgeAt: scheduledPurge,
          preDeleteStatus:  file.status,
        } as any,
      })
      await tx.mediaFile.update({
        where: { id: fileId },
        data:  { status: 'DELETED' as any },
      })
      return item.id
    })
  } catch (err) {
    logger.error('FILE_DELETED_FAILED', { userId, userRole: role, route: '/api/files/[fileId]', fileId, error: (err as Error)?.message, errorCode: (err as any)?.code, message: 'Transaction failed — could not move file to Trash' })
    return NextResponse.json(
      { error: 'Failed to move file to Trash. Please try again.' },
      { status: 500 },
    )
  }

  await log('FILE_DELETED', userId, {
    mediaFileId: fileId,
    eventId:     file.eventId,
    metadata: {
      fileName:        file.originalName,
      storedName:      file.storedName,
      preDeleteStatus: file.status,
      scheduledPurgeAt: scheduledPurge.toISOString(),
      deletedByRole:   role,
    },
  })

  return NextResponse.json({
    success:     true,
    trashItemId,
    purgesAt:    scheduledPurge.toISOString(),
  })
}
