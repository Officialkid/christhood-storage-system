import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { deleteObject }              from '@/lib/r2'
import { log }                       from '@/lib/activityLog'

// DELETE /api/admin/trash/[trashItemId]
// ADMIN only — immediately purges a trashed file (deletes from R2 + removes DB records)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { trashItemId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden'       }, { status: 403 })

  const { trashItemId } = params
  const adminId         = session.user.id

  const trashItem = await prisma.trashItem.findUnique({
    where:   { id: trashItemId },
    include: { mediaFile: true },
  })

  if (!trashItem) {
    return NextResponse.json({ error: 'Trash item not found' }, { status: 404 })
  }

  const { mediaFile } = trashItem

  try {
    // 1. Delete from Cloudflare R2
    await deleteObject(mediaFile.r2Key)

    // 2. Mark as PURGED + remove TrashItem atomically
    await prisma.$transaction([
      prisma.mediaFile.update({
        where: { id: mediaFile.id },
        data:  { status: 'PURGED' as any, purgedAt: new Date() } as any,
      }),
      prisma.trashItem.delete({ where: { id: trashItemId } }),
    ])
  } catch (err) {
    logger.error('FILE_PURGE_FAILED', { userId: adminId, userRole: 'ADMIN', route: '/api/admin/trash/[trashItemId]', fileId: mediaFile.id, error: (err as Error)?.message, errorCode: (err as any)?.code, message: 'Failed to permanently delete file' })
    return NextResponse.json(
      { error: 'Failed to permanently delete file. Please try again.' },
      { status: 500 },
    )
  }

  // Log — retained indefinitely even after purge
  await log('FILE_PURGED', adminId, {
    mediaFileId: mediaFile.id,
    eventId:     mediaFile.eventId,
    metadata: {
      fileName:       mediaFile.originalName,
      storedName:     mediaFile.storedName,
      purgedAt:       new Date().toISOString(),
      manually:       true,
      deletedAt:      trashItem.deletedAt.toISOString(),
      deletedBy:      trashItem.deletedById,
    },
  }).catch(() => {})

  return NextResponse.json({ message: 'File permanently deleted' })
}
