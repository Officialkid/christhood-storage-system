/**
 * POST /api/photo/albums/[id]/upload
 *
 * Accepts a single image file (multipart/form-data, field: "file").
 * Processes thumb + preview + original with Sharp, uploads to R2.
 * Creates a PhotoItem and updates album + user storage counters.
 *
 * Max upload: 50 MB per file.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'
import { processPlatformPhoto, isAcceptedImageType } from '@/lib/photo-gallery/storage'

export const maxDuration = 60 // seconds

const MAX_FILE_BYTES     = 50 * 1024 * 1024 // 50 MB
const MAX_STORAGE_BUFFER = 1024 * 1024       // 1 MB grace buffer

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: albumId } = await params

  // Verify album ownership
  const album = await prisma.photoAlbum.findFirst({
    where: { id: albumId, collection: { ownerId: session.userId } },
    select: { id: true, collectionId: true },
  })
  if (!album) return NextResponse.json({ error: 'Album not found.' }, { status: 404 })

  // Check storage quota
  const user = await prisma.photoUser.findUnique({
    where:  { id: session.userId },
    select: { storageUsedBytes: true, storageLimitBytes: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }

  if (!isAcceptedImageType(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Accepted: JPEG, PNG, WebP, GIF, HEIC.' },
      { status: 400 },
    )
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 413 })
  }

  // Storage quota check
  const available = user.storageLimitBytes - user.storageUsedBytes
  if (BigInt(file.size) > available + BigInt(MAX_STORAGE_BUFFER)) {
    return NextResponse.json(
      { error: 'Storage quota exceeded. Upgrade your plan to upload more photos.' },
      { status: 402 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await processPlatformPhoto(
    buffer,
    file.name,
    file.type,
    session.userId,
    albumId,
  )

  // Create PhotoItem + update album + user storage (in one transaction)
  const [item] = await prisma.$transaction([
    prisma.photoItem.create({
      data: {
        albumId,
        thumbnailKey:  result.thumbnailKey,
        previewKey:    result.previewKey,
        originalKey:   result.originalKey,
        originalName:  file.name,
        mimeType:      result.mimeType,
        fileSizeBytes: BigInt(result.fileSizeBytes),
        width:         result.width  || null,
        height:        result.height || null,
      },
    }),
    prisma.photoAlbum.update({
      where: { id: albumId },
      data: {
        photoCount:     { increment: 1 },
        totalSizeBytes: { increment: BigInt(result.fileSizeBytes) },
      },
    }),
    prisma.photoUser.update({
      where: { id: session.userId },
      data:  { storageUsedBytes: { increment: BigInt(result.fileSizeBytes) } },
    }),
  ])

  return NextResponse.json({
    item: {
      ...item,
      thumbnailUrl: result.thumbnailUrl,
      previewUrl:   result.previewUrl,
      originalUrl:  result.originalUrl,
    },
  }, { status: 201 })
}
