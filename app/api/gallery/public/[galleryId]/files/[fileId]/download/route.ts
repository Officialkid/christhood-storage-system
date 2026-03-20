import { NextRequest, NextResponse } from 'next/server'
import { prisma }           from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

export async function GET(
  req:     NextRequest,
  { params }: { params: { galleryId: string; fileId: string } },
) {
  const { galleryId, fileId } = params

  // Load gallery + file together
  const file = await prisma.galleryFile.findFirst({
    where:   { id: fileId, galleryId },
    select:  {
      id:           true,
      originalKey:  true,
      originalName: true,
      fileType:     true,
      gallery: {
        select: {
          allowDownload:          true,
          requireNameForDownload: true,
          status:                 true,
        },
      },
    },
  })

  if (!file || file.gallery.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!file.gallery.allowDownload) {
    return NextResponse.json({ error: 'Downloads are disabled for this gallery' }, { status: 403 })
  }

  const visitorName = req.nextUrl.searchParams.get('name')?.slice(0, 200) ?? null

  if (file.gallery.requireNameForDownload && !visitorName) {
    return NextResponse.json(
      { error: 'name query parameter is required for this gallery' },
      { status: 400 },
    )
  }

  // Fetch original from R2 via the public URL
  const downloadUrl = getGalleryPublicUrl(file.originalKey)
  let upstream: Response
  try {
    upstream = await fetch(downloadUrl)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch file from storage' }, { status: 502 })
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'File not available' }, { status: 502 })
  }

  // Record download — fire-and-forget
  const ua = req.headers.get('user-agent') ?? ''
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'MOBILE' : 'DESKTOP'
  prisma.galleryDownload
    .create({
      data: {
        galleryId,
        fileId,
        downloadType: 'SINGLE',
        visitorName,
        deviceType,
      },
    })
    .then(() =>
      prisma.publicGallery.updateMany({
        where: { id: galleryId },
        data:  { downloadCount: { increment: 1 } },
      }),
    )
    .catch(() => {})

  // Determine safe filename
  const safeName = file.originalName.replace(/[^a-zA-Z0-9._\- ]/g, '_')

  // Stream back to client
  const headers = new Headers()
  headers.set('Content-Type',        upstream.headers.get('Content-Type') ?? 'application/octet-stream')
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`)
  headers.set('Cache-Control',       'private, no-store')
  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new NextResponse(upstream.body, { status: 200, headers })
}
