import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'

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

  const [items, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where: {
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

  // Move to trash instead of hard-delete
  await prisma.trashItem.create({
    data: {
      mediaFileId:      id,
      deletedById:      session.user.id,
      scheduledPurgeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      preDeleteStatus:  mediaFile.status,
    }
  })
  return NextResponse.json({ success: true })
}
