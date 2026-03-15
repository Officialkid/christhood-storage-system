import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { canBatchDownload }          from '@/lib/downloadAuth'
import { getPresignedDownloadUrl }   from '@/lib/r2'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import archiver                      from 'archiver'
import { PassThrough, Readable }     from 'stream'

/**
 * POST /api/download/batch
 *
 * Body: { eventId: string, subfolderId?: string }
 *
 * Streams a ZIP archive of all files in the event (or subfolder) directly to the client.
 * Only ADMIN and EDITOR may use this endpoint.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!canBatchDownload(session.user.role)) {
    return NextResponse.json(
      { error: 'Batch download requires EDITOR or ADMIN role' },
      { status: 403 },
    )
  }

  const { eventId, subfolderId } = await req.json() as {
    eventId:     string
    subfolderId?: string
  }

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  // Load event for the archive name
  const event = await prisma.event.findUnique({
    where:   { id: eventId },
    include: { category: { include: { year: true } } },
  })
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Load files scoped to event (+ optional subfolder)
  const files = await prisma.mediaFile.findMany({
    where: {
      eventId,
      subfolderId: subfolderId ?? null,
    },
    select: {
      id:           true,
      r2Key:        true,
      originalName: true,
      eventId:      true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files found' }, { status: 404 })
  }

  // ── Stream a ZIP via archiver ──────────────────────────────────────────────
  const pass    = new PassThrough()
  const archive = archiver('zip', { zlib: { level: 5 } })
  archive.pipe(pass)

  // Kick off ZIP construction in the background so we can start streaming immediately
  ;(async () => {
    for (const file of files) {
      try {
        const url = await getPresignedDownloadUrl(file.r2Key, 900) // 15-min URL per file
        const res = await fetch(url)
        if (!res.ok || !res.body) {
          console.warn(`[batch-zip] skipping ${file.originalName}: R2 fetch failed`)
          continue
        }
        // Convert the Web ReadableStream returned by fetch into a Node.js Readable
        const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
        archive.append(nodeStream, { name: file.originalName })
      } catch (err) {
        console.warn(`[batch-zip] error adding ${file.originalName}:`, err)
      }
    }
    archive.finalize()
  })()

  // Wrap the Node PassThrough as a Web ReadableStream for the Response
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      pass.on('data',  chunk => controller.enqueue(new Uint8Array(chunk)))
      pass.on('end',   ()    => controller.close())
      pass.on('error', err   => controller.error(err))
    },
    cancel() {
      archive.abort()
      pass.destroy()
    },
  })

  // Log the batch download (async, non-blocking)
  log('BATCH_DOWNLOADED', session.user.id, {
    eventId,
    metadata: {
      fileCount:   files.length,
      subfolderId: subfolderId ?? null,
      eventName:   event.name,
    },
  }).catch((e: unknown) => console.warn('[batch-zip log]', e))

  // Derive a clean filename for the ZIP
  const label = event.name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 50)
  const zipName = `${label}_${files.length}files.zip`

  return new Response(webStream, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-store',
    },
  })
}
