import { NextRequest, NextResponse } from 'next/server'
import { Readable }         from 'node:stream'
import { PassThrough }      from 'node:stream'
import archiver             from 'archiver'
import { prisma }           from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

// Next.js App Router needs to know this route streams a large body
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — Cloud Run allows up to the configured timeout

export async function GET(
  req:     NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

  const gallery = await prisma.publicGallery.findFirst({
    where:  { id: galleryId, status: 'PUBLISHED' },
    select: {
      id:                     true,
      title:                  true,
      allowDownload:          true,
      requireNameForDownload: true,
      sections: {
        orderBy: { sortOrder: 'asc' },
        select:  {
          id:    true,
          title: true,
          date:  true,
          files: {
            where:   { isVisible: true },
            orderBy: { sortOrder: 'asc' },
            select:  { id: true, originalKey: true, originalName: true },
          },
        },
      },
    },
  })

  if (!gallery) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!gallery.allowDownload) {
    return NextResponse.json({ error: 'Downloads disabled' }, { status: 403 })
  }

  const visitorName = req.nextUrl.searchParams.get('name')?.slice(0, 200) ?? null
  if (gallery.requireNameForDownload && !visitorName) {
    return NextResponse.json(
      { error: 'name query parameter is required for this gallery' },
      { status: 400 },
    )
  }

  // ── Build ZIP via streaming ───────────────────────────────────────────────
  const passThrough = new PassThrough()
  const archive     = archiver('zip', { store: true }) // STORE = no compression (lossless!)

  archive.on('error', (err) => {
    console.error('[download-all] archiver error:', err)
    passThrough.destroy(err)
  })
  archive.pipe(passThrough)

  // Kick off file fetching in an async IIFE — don't await here
  ;(async () => {
    for (const section of gallery.sections) {
      if (section.files.length === 0) continue

      const sectionDate = section.date
        ? new Date(section.date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          })
        : null

      // Folder: "Section Title — 05 Apr 2024/" or just "Section Title/"
      const folderName = sectionDate
        ? `${sanitizeFolder(section.title)} — ${sectionDate}`
        : sanitizeFolder(section.title)

      for (const file of section.files) {
        try {
          const url = getGalleryPublicUrl(file.originalKey)
          const res = await fetch(url)
          if (!res.ok || !res.body) continue
          // Convert web ReadableStream → Node.js Readable
          const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
          archive.append(nodeStream, {
            name:   sanitizeFilename(file.originalName),
            prefix: folderName,
          })
        } catch (e) {
          console.warn('[download-all] skipping file', file.id, e)
        }
      }
    }
    await archive.finalize()
  })().catch((e) => {
    console.error('[download-all] stream error:', e)
    passThrough.destroy(e as Error)
  })

  // Record download (fire-and-forget)
  const ua         = req.headers.get('user-agent') ?? ''
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'MOBILE' : 'DESKTOP'
  prisma.galleryDownload
    .create({
      data: { galleryId, downloadType: 'ALL_ZIP', visitorName, deviceType },
    })
    .then(() =>
      prisma.publicGallery.updateMany({
        where: { id: galleryId },
        data:  { downloadCount: { increment: 1 } },
      }),
    )
    .catch(() => {})

  // Pipe PassThrough → Web ReadableStream for NextResponse
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      passThrough.on('data',  (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      passThrough.on('end',   ()              => controller.close())
      passThrough.on('error', (err)           => controller.error(err))
    },
    cancel() {
      passThrough.destroy()
    },
  })

  const zipFilename = `${sanitizeFilename(gallery.title)} — Christhood.zip`

  return new NextResponse(webStream, {
    status:  200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
      'Cache-Control':       'private, no-store',
      // Disable buffering on Cloud Run so streaming starts immediately
      'X-Accel-Buffering':   'no',
    },
  })
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200)
}

function sanitizeFolder(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.+$/, '').slice(0, 100)
}
