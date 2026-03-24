import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { log }                        from '@/lib/activityLog'
import { notifyFileRestored }         from '@/lib/notifications'

// POST /api/admin/trash/[trashItemId]/restore
// ADMIN only — restores a trashed file back to its previous status
export async function POST(req: NextRequest, props: { params: Promise<{ trashItemId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden'       }, { status: 403 })

  const { trashItemId } = params
  const adminId         = session.user.id

  // ── Load trash item ───────────────────────────────────────────────────────
  const trashItem = await prisma.trashItem.findUnique({
    where:   { id: trashItemId },
    include: { mediaFile: true },
  })

  if (!trashItem) {
    return NextResponse.json({ error: 'Trash item not found' }, { status: 404 })
  }

  // Check the 30-day window hasn't expired (guard — purge cron should have cleaned it up)
  if (trashItem.scheduledPurgeAt < new Date()) {
    return NextResponse.json(
      { error: 'Purge window has expired. This file may have already been permanently deleted.' },
      { status: 410 },
    )
  }

  const { mediaFile } = trashItem

  // ── Atomic: restore MediaFile status + delete TrashItem ──────────────────
  await prisma.$transaction([
    prisma.mediaFile.update({
      where: { id: mediaFile.id },
      data:  { status: (trashItem as any).preDeleteStatus },
    }),
    prisma.trashItem.delete({ where: { id: trashItemId } }),
  ])

  // ── Log ───────────────────────────────────────────────────────────────────
  await log('FILE_RESTORED', adminId, {
    mediaFileId: mediaFile.id,
    eventId:     mediaFile.eventId,
    metadata: {
      fileName:       mediaFile.originalName,
      restoredStatus: (trashItem as any).preDeleteStatus,
      wasDeletedBy:   trashItem.deletedById,
      deletedAt:      trashItem.deletedAt.toISOString(),
    },
  })

  // Notify admins/editors — fire-and-forget
  notifyFileRestored({
    fileId:   mediaFile.id,
    fileName: mediaFile.originalName,
    actorId:  adminId,
  }).catch(() => {})

  return NextResponse.json({
    message:        'File restored successfully',
    restoredStatus: (trashItem as any).preDeleteStatus,
  })
}
