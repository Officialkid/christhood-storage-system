import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

type Params = { params: Promise<{ id: string }> }

// GET /api/photo/albums/[id]
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const album = await prisma.photoAlbum.findFirst({
    where:   { id, collection: { ownerId: session.userId } },
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
      _count: { select: { shareTokens: true } },
    },
  })

  if (!album) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const hydrated = {
    ...album,
    coverUrl: album.coverKey ? getGalleryPublicUrl(album.coverKey) : null,
    items: album.items.map(item => ({
      ...item,
      thumbnailUrl: getGalleryPublicUrl(item.thumbnailKey),
      previewUrl:   getGalleryPublicUrl(item.previewKey),
      originalUrl:  album.allowDownload ? getGalleryPublicUrl(item.originalKey) : null,
    })),
  }

  return NextResponse.json({ album: hydrated })
}

// PUT /api/photo/albums/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as {
    title?:        string
    description?:  string
    visibility?:   'PUBLIC' | 'PASSWORD' | 'PRIVATE'
    password?:     string
    allowDownload?: boolean
    coverKey?:     string
  }

  const album = await prisma.photoAlbum.findFirst({
    where: { id, collection: { ownerId: session.userId } },
    select: { id: true, visibility: true },
  })
  if (!album) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  let passwordHash: string | null | undefined
  if (body.visibility === 'PASSWORD') {
    if (!body.password?.trim()) {
      return NextResponse.json(
        { error: 'A password is required for PASSWORD visibility.' },
        { status: 400 },
      )
    }
    passwordHash = await bcrypt.hash(body.password, 10)
  } else if (body.visibility) {
    passwordHash = null
  }

  const updated = await prisma.photoAlbum.update({
    where: { id },
    data: {
      ...(body.title        !== undefined && { title: body.title.trim().slice(0, 120) }),
      ...(body.description  !== undefined && { description: body.description.trim().slice(0, 500) }),
      ...(body.visibility   !== undefined && { visibility: body.visibility }),
      ...(body.allowDownload !== undefined && { allowDownload: body.allowDownload }),
      ...(body.coverKey     !== undefined && { coverKey: body.coverKey }),
      ...(passwordHash      !== undefined && { passwordHash }),
    },
  })

  return NextResponse.json({ album: updated })
}

// DELETE /api/photo/albums/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const album = await prisma.photoAlbum.findFirst({
    where: { id, collection: { ownerId: session.userId } },
    select: { id: true, items: { select: { thumbnailKey: true, previewKey: true, originalKey: true } } },
  })
  if (!album) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Delete R2 objects for all items
  if (album.items.length > 0) {
    const { deletePlatformPhoto } = await import('@/lib/photo-gallery/storage')
    await Promise.allSettled(
      album.items.map(i => deletePlatformPhoto(i.thumbnailKey, i.previewKey, i.originalKey)),
    )
  }

  // Update user storage bytes
  const [totalSize] = await Promise.all([
    prisma.photoItem.aggregate({
      where: { albumId: id },
      _sum:  { fileSizeBytes: true },
    }),
  ])
  const freed = totalSize._sum.fileSizeBytes ?? BigInt(0)

  await prisma.$transaction([
    prisma.photoUser.update({
      where: { id: session.userId },
      data:  { storageUsedBytes: { decrement: freed } },
    }),
    prisma.photoAlbum.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
