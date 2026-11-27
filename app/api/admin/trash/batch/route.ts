import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { purgeTrashedMediaFile } from '@/lib/trashPurge'
import { log } from '@/lib/activityLog'
import { logger } from '@/lib/logger'

/**
 * POST /api/admin/trash/batch
 * Body: { action: 'restore' | 'purge', trashItemIds: string[] }
 * ADMIN only — bulk restores or permanently purges selected trash items.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { action?: string; trashItemIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, trashItemIds } = body
  if ((action !== 'restore' && action !== 'purge') || !Array.isArray(trashItemIds) || trashItemIds.length === 0) {
    return NextResponse.json({ error: 'Valid action (restore | purge) and non-empty trashItemIds required' }, { status: 400 })
  }

  const adminId = session.user.id
  const items = await prisma.trashItem.findMany({
    where:   { id: { in: trashItemIds as string[] } },
    include: { mediaFile: true },
  })

  const succeeded: string[] = []
  const failed: { id: string; error: string }[] = []

  for (const item of items) {
    try {
      if (action === 'restore') {
        await prisma.$transaction([
          prisma.mediaFile.update({
            where: { id: item.mediaFileId },
            data:  { status: item.preDeleteStatus as any },
          }),
          prisma.trashItem.delete({ where: { id: item.id } }),
        ])
        await log('FILE_RESTORED', adminId, {
          mediaFileId: item.mediaFileId,
          eventId:     item.mediaFile.eventId,
          metadata:    { fileName: item.mediaFile.originalName, restoredTo: item.preDeleteStatus, batch: true },
        }).catch(() => {})
      } else {
        await purgeTrashedMediaFile(item.id, item.mediaFileId)
        await log('FILE_PURGED', adminId, {
          mediaFileId: item.mediaFileId,
          eventId:     item.mediaFile.eventId,
          metadata:    { fileName: item.mediaFile.originalName, manually: true, batch: true },
        }).catch(() => {})
      }
      succeeded.push(item.id)
    } catch (err) {
      logger.error('TRASH_BATCH_ACTION_FAILED', {
        userId: adminId,
        userRole: 'ADMIN',
        route: '/api/admin/trash/batch',
        message: `Batch trash ${action} failed for item ${item.id}`,
        metadata: { trashItemId: item.id, action },
        error: (err as Error)?.message,
      })
      failed.push({ id: item.id, error: (err as Error)?.message ?? 'Failed' })
    }
  }

  return NextResponse.json({ succeeded, failed })
}
