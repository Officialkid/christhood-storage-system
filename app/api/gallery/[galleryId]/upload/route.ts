/**
 * POST /api/gallery/[galleryId]/upload
 * Uploads a photo/video file to a gallery section.
 * Allowed: UPLOADER, EDITOR, ADMIN
 * Expects multipart/form-data with fields: file, sectionId (optional)
 */

import { NextRequest, NextResponse }                 from 'next/server'
import { getServerSession }                          from 'next-auth'
import { authOptions }                               from '@/lib/auth'
import { prisma }                                    from '@/lib/prisma'
import { logger }                                    from '@/lib/logger'
import { processAndUploadImage }                     from '@/lib/gallery/image-processor'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
  'image/x-raw', 'image/x-adobe-dng', 'image/x-canon-cr2', 'image/x-canon-cr3',
  'image/x-nikon-nef', 'image/x-sony-arw', 'image/x-olympus-orf',
  'image/x-panasonic-rw2', 'image/x-pentax-pef', 'image/x-samsung-srw',
  'image/x-fuji-raf',
])

export async function POST(req: NextRequest, props: { params: Promise<{ galleryId: string }> }) {
  const params = await props.params;
  const { galleryId } = params
  let fileName: string | undefined // hoisted so the catch block can include it in diagnostics

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { role, id: userId } = session.user

    // Verify gallery exists and check access
    const gallery = await prisma.publicGallery.findUnique({
      where:  { id: galleryId },
      select: { id: true, slug: true, status: true, createdById: true },
    })

    if (!gallery) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 })

    // Only allow uploads to non-archived galleries
    if (gallery.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot upload to an archived gallery' }, { status: 409 })
    }

    // UPLOADERs can only upload to DRAFT galleries
    if (role === 'UPLOADER' && gallery.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Uploads are only allowed to draft galleries' }, { status: 409 })
    }

    // EDITOR can only upload to their own galleries
    if (role === 'EDITOR' && gallery.createdById !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const file     = formData.get('file')
    const sectionId = formData.get('sectionId')?.toString() ?? null

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB` }, { status: 413 })
    }

    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: `File type "${mimeType}" is not supported` }, { status: 415 })
    }

    const originalFilename = (file as File).name ?? `upload-${Date.now()}`
    fileName = originalFilename // capture for error logging

    // Validate sectionId belongs to this gallery
    if (sectionId) {
      const section = await prisma.gallerySection.findFirst({
        where:  { id: sectionId, galleryId },
        select: { id: true },
      })
      if (!section) {
        return NextResponse.json({ error: 'Section not found in this gallery' }, { status: 404 })
      }
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer())

    const uploadResult = await processAndUploadImage(
      sourceBuffer,
      gallery.slug,
      sectionId ?? 'unsorted',
      originalFilename,
      mimeType,
    )

    const galleryFile = await prisma.galleryFile.create({
      data: {
        galleryId,
        sectionId:    sectionId ?? null,
        fileType:     'PHOTO',
        originalName: originalFilename,
        fileSize:     BigInt(uploadResult.originalSize),
        thumbnailKey: uploadResult.thumbnailKey,
        previewKey:   uploadResult.previewKey,
        originalKey:  uploadResult.originalKey,
        width:        uploadResult.width        ?? null,
        height:       uploadResult.height       ?? null,
        isVisible:    true,
      },
    })

    // Update counters
    await prisma.$transaction([
      prisma.publicGallery.update({
        where: { id: galleryId },
        data:  {
          totalPhotos: { increment: 1 },
        },
      }),
      ...(sectionId ? [
        prisma.gallerySection.update({
          where: { id: sectionId },
          data:  { photoCount: { increment: 1 } },
        }),
      ] : []),
    ])

    logger.info('GALLERY_PHOTO_UPLOADED', {
      userId,
      userRole:    role,
      route:       `/api/gallery/${galleryId}/upload`,
      fileId:      galleryFile.id,
      message:     `Photo uploaded to gallery`,
      metadata:    { galleryId, sectionId, originalFilename, isRaw: uploadResult.isRaw, originalSize: uploadResult.originalSize },
    })

    return NextResponse.json(
      {
        file:    galleryFile,
        urls: {
          thumbnail: uploadResult.thumbnailUrl,
          preview:   uploadResult.previewUrl,
          original:  uploadResult.originalUrl,
        },
        isRaw: uploadResult.isRaw,
        ...(uploadResult.isRaw && {
          notice: 'RAW files are stored as-is and will not display a preview in the gallery.',
        }),
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('GALLERY_UPLOAD_ERROR:', {
      message: err?.message,
      code:    err?.code,
      galleryId,
      fileName,
    })
    logger.error('GALLERY_UPLOAD_ERROR', {
      userId:   undefined,
      userRole: undefined,
      route:    `/api/gallery/${galleryId}/upload`,
      error:    err instanceof Error ? err.message : String(err),
      message:  'Unexpected error during gallery upload',
      metadata: { galleryId, fileName, code: err?.code },
    })

    if (err?.message?.includes('GALLERY_R2')) {
      return NextResponse.json(
        { error: 'Gallery storage is not configured. Contact your admin.' },
        { status: 503 },
      )
    }
    if (err?.code?.startsWith('P2')) {
      return NextResponse.json(
        { error: 'Database error: ' + err.message },
        { status: 500 },
      )
    }
    return NextResponse.json(
      { error: 'Upload failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 },
    )
  }
}
