import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import type { FileStatus } from '@prisma/client'

/**
 * GET /api/media
 * Returns paginated media items the caller has access to.
 * Query params: page (default 1), limit (default 24), type, eventId
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, parseInt(searchParams.get('page')    ?? '1'))
  const limit   = Math.min(100, parseInt(searchParams.get('limit') ?? '24'))
  const type    = searchParams.get('type')    ?? undefined
  const eventId = searchParams.get('eventId') ?? undefined

  const isAdmin    = session.user.role === 'ADMIN'
  // Non-admins must not see DELETED or PURGED files
  const statusFilter = { notIn: (isAdmin ? ['PURGED'] : ['PURGED', 'DELETED']) as FileStatus[] }

  const [items, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where: {
        status: statusFilter,
        ...(type    ? { fileType: type as 'PHOTO' | 'VIDEO' } : {}),
        ...(eventId ? { eventId }                             : {})
      },
      include: {
        uploader: { select: { id: true, username: true, email: true } },
        event:    { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit
    }),
    prisma.mediaFile.count({
      where: {
        status: statusFilter,
        ...(type    ? { fileType: type as 'PHOTO' | 'VIDEO' } : {}),
        ...(eventId ? { eventId }                             : {})
      }
    })
  ])

  // Attach fresh presigned download URLs for private objects
  const enriched = await Promise.all(
    items.map(async (m) => ({
      ...m,
      fileSize:    m.fileSize.toString(),
      downloadUrl: await getPresignedDownloadUrl(m.r2Key),
    }))
  )

  return NextResponse.json({ items: enriched, total, page, limit })
}

/**
 * PATCH /api/media
 * Body: { id: string, status?: string, tags?: string[], description?: string }
 * Used after client-side upload to flip status to READY.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, tags, description } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const role = session.user.role as string

  if (role !== 'ADMIN' && role !== 'EDITOR') {
    // UPLOADERs may only update their own files
    const file = await prisma.mediaFile.findUnique({ where: { id }, select: { uploaderId: true } })
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (file.uploaderId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // UPLOADERs can only flip their files to READY (to complete the upload flow)
    if (status && status !== 'READY') {
      return NextResponse.json({ error: 'Forbidden: insufficient role to set this status' }, { status: 403 })
    }
  }

  const updated = await prisma.mediaFile.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
    }
  })

  return NextResponse.json({ ...updated, fileSize: updated.fileSize.toString() })
}

/**
 * DELETE /api/media
 * Body: { id: string }
 * Soft-deletes (marks DELETED); hard-delete via admin panel.
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only ADMIN or the original uploader may delete
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id } })
  if (!mediaFile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin    = session.user.role === 'ADMIN'
  const isUploader = mediaFile.uploaderId === session.user.id
  if (!isAdmin && !isUploader) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Atomically mark file as DELETED and move to trash
  await prisma.$transaction([
    prisma.mediaFile.update({
      where: { id },
      data:  { status: 'DELETED' },
    }),
    prisma.trashItem.create({
      data: {
        mediaFileId:      id,
        deletedById:      session.user.id,
        scheduledPurgeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        preDeleteStatus:  mediaFile.status,
      }
    }),
  ])

  await log('FILE_DELETED', session.user.id, {
    mediaFileId: id,
    eventId:     mediaFile.eventId,
    metadata:    { fileName: mediaFile.originalName, eventId: mediaFile.eventId },
  })

  return NextResponse.json({ success: true })
}
