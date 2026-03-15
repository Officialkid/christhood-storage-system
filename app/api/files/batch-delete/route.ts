import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

// POST /api/files/batch-delete
// Body: { fileIds: string[] }
// Returns: { deleted: [{ id, purgesAt }], failed: [{ id, reason }] }
// Applies the same per-file role/status permission rules as DELETE /api/files/[fileId].
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const role   = session.user.role as string
  const userId = session.user.id

  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Uploaders cannot delete files.' }, { status: 403 })
  }

  let body: { fileIds?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { fileIds } = body
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json({ error: 'fileIds must be a non-empty array' }, { status: 422 })
  }
  if (fileIds.length > 100) {
    return NextResponse.json({ error: 'Cannot delete more than 100 files at once' }, { status: 422 })
  }

  const files = await prisma.mediaFile.findMany({
    where:   { id: { in: fileIds as string[] } },
    include: { trashItem: true },
  })

  const now = new Date()
  const deleted: { id: string; purgesAt: string }[] = []
  const failed:  { id: string; reason: string }[]   = []

  // Report any IDs that weren't found
  const foundIds = new Set(files.map(f => f.id))
  for (const id of fileIds as string[]) {
    if (!foundIds.has(id)) failed.push({ id, reason: 'File not found' })
  }

  for (const file of files) {
    const status = file.status as string

    if (status === 'DELETED' || file.trashItem) {
      failed.push({ id: file.id, reason: 'Already in Trash' }); continue
    }
    if (status === 'PURGED') {
      failed.push({ id: file.id, reason: 'Already purged' }); continue
    }

    // Editor permission check
    if (role === 'EDITOR') {
      if (status === 'PUBLISHED') {
        failed.push({ id: file.id, reason: 'Cannot delete published files' }); continue
      }
      if (file.uploaderId !== userId && status !== 'RAW') {
        failed.push({ id: file.id, reason: "Cannot delete another user's non-RAW file" }); continue
      }
    }

    try {
      const scheduledPurge = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      await prisma.$transaction(async (tx) => {
        await tx.trashItem.create({
          data: {
            mediaFileId:      file.id,
            deletedById:      userId,
            deletedAt:        now,
            scheduledPurgeAt: scheduledPurge,
            preDeleteStatus:  file.status,
          } as any,
        })
        await tx.mediaFile.update({
          where: { id: file.id },
          data:  { status: 'DELETED' as any },
        })
      })

      // Fire-and-forget so a log failure doesn't break the response
      log('FILE_DELETED', userId, {
        mediaFileId: file.id,
        eventId:     file.eventId,
        metadata: {
          fileName:        file.originalName,
          preDeleteStatus: file.status,
          scheduledPurgeAt: scheduledPurge.toISOString(),
          batchDelete:     true,
          deletedByRole:   role,
        },
      }).catch(() => {})

      deleted.push({ id: file.id, purgesAt: scheduledPurge.toISOString() })
    } catch (err) {
      console.error(`[POST /api/files/batch-delete] failed for file ${file.id}:`, err)
      failed.push({ id: file.id, reason: 'Server error — please try again' })
    }
  }

  return NextResponse.json({ deleted, failed })
}
