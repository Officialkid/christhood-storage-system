/**
 * PUT    /api/photo/items/[id]  — update caption or sortOrder
 * DELETE /api/photo/items/[id]  — delete photo (R2 + DB)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'
import { deletePlatformPhoto } from '@/lib/photo-gallery/storage'

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { caption, sortOrder } = await req.json() as { caption?: string; sortOrder?: number }

  const item = await prisma.photoItem.findFirst({
    where: { id, album: { collection: { ownerId: session.userId } } },
    select: { id: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const updated = await prisma.photoItem.update({
    where: { id },
    data: {
      ...(caption   !== undefined && { caption: caption.trim().slice(0, 200) }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })

  return NextResponse.json({ item: updated })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const item = await prisma.photoItem.findFirst({
    where: { id, album: { collection: { ownerId: session.userId } } },
    select: {
      id:            true,
      albumId:       true,
      thumbnailKey:  true,
      previewKey:    true,
      originalKey:   true,
      fileSizeBytes: true,
    },
  })
  if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Delete from R2
  await deletePlatformPhoto(item.thumbnailKey, item.previewKey, item.originalKey)

  // Delete from DB + update counters
  await prisma.$transaction([
    prisma.photoItem.delete({ where: { id } }),
    prisma.photoAlbum.update({
      where: { id: item.albumId },
      data: {
        photoCount:     { decrement: 1 },
        totalSizeBytes: { decrement: item.fileSizeBytes },
      },
    }),
    prisma.photoUser.update({
      where: { id: session.userId },
      data:  { storageUsedBytes: { decrement: item.fileSizeBytes } },
    }),
  ])

  return NextResponse.json({ ok: true })
}
