import { NextRequest, NextResponse }  from 'next/server'
import bcrypt                         from 'bcryptjs'
import archiver                       from 'archiver'
import { PassThrough, Readable }      from 'stream'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'
import { sanitizePath }               from '@/lib/sanitize'
import { logger }                     from '@/lib/logger'

// Binary formats — store without re-compression to preserve quality
const STORE_EXTS = new Set([
  'jpg','jpeg','png','gif','webp','mp4','mov','avi','heic',
  'raw','cr2','nef','arw','dng','orf','rw2','tiff','tif',
  'psd','ai','pdf','zip','rar','7z','gz',
])

function extractIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

/**
 * GET /api/share/[token]/download
 * Public endpoint — no authentication required.
 *
 * Query params:
 *   pin?     4-digit PIN if the link requires one
 *   fileId?  if provided, stream a single file instead of a ZIP
 *
 * When fileId is absent, streams a ZIP of all files.
 * When fileId is provided, returns a short-lived presigned R2 URL for that file.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const pin    = req.nextUrl.searchParams.get('pin') ?? null
  const fileId = req.nextUrl.searchParams.get('fileId') ?? null

  const link = await prisma.shareLink.findUnique({ where: { token } })

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  // ── State checks ───────────────────────────────────────────────────────────
  if (link.isRevoked) {
    return NextResponse.json({ error: 'This link has been deactivated by the sender.' }, { status: 410 })
  }
  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }
  if (link.maxDownloads != null && link.downloadCount >= link.maxDownloads) {
    return NextResponse.json({ error: 'This link has reached its download limit.' }, { status: 410 })
  }

  // ── PIN check ──────────────────────────────────────────────────────────────
  if (link.pinHash) {
    if (!pin) return NextResponse.json({ requiresPin: true }, { status: 401 })
    const ok = await bcrypt.compare(pin, link.pinHash)
    if (!ok) return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 403 })
  }

  // ── Resolve files ──────────────────────────────────────────────────────────
  type FileEntry = { id: string; name: string; r2Key: string; folderPath: string | null }
  let allFiles: FileEntry[] = []

  if (link.linkType === 'FILE' && link.fileId) {
    const f = await prisma.mediaFile.findUnique({
      where:  { id: link.fileId },
      select: { id: true, originalName: true, r2Key: true },
    })
    if (f) allFiles = [{ id: f.id, name: f.originalName, r2Key: f.r2Key, folderPath: null }]

  } else if (link.linkType === 'EVENT' && link.eventId) {
    const where = link.subfolderId
      ? { eventId: link.eventId, subfolderId: link.subfolderId }
      : { eventId: link.eventId }
    const rows = await prisma.mediaFile.findMany({
      where:  { ...where, status: { notIn: ['DELETED', 'PURGED'] } },
      select: { id: true, originalName: true, r2Key: true, subfolder: { select: { label: true } } },
      orderBy: { createdAt: 'desc' },
    })
    allFiles = rows.map(f => ({
      id:         f.id,
      name:       f.originalName,
      r2Key:      f.r2Key,
      folderPath: f.subfolder?.label ?? null,
    }))

  } else if (link.linkType === 'TRANSFER' && link.transferId) {
    const rows = await prisma.transferFile.findMany({
      where:   { transferId: link.transferId },
      select:  { id: true, originalName: true, r2Key: true, folderPath: true },
      orderBy: { createdAt: 'asc' },
    })
    allFiles = rows.map(f => ({ id: f.id, name: f.originalName, r2Key: f.r2Key, folderPath: f.folderPath ?? null }))
  }

  if (allFiles.length === 0) {
    return NextResponse.json({ error: 'No files available for this link.' }, { status: 404 })
  }

  const ip        = extractIp(req)
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  // ── Single file download ───────────────────────────────────────────────────
  if (fileId) {
    const target = allFiles.find(f => f.id === fileId)
    if (!target) return NextResponse.json({ error: 'File not in this share link.' }, { status: 404 })

    const presignedUrl = await getPresignedDownloadUrl(target.r2Key, 300)

    // Log the download
    prisma.shareLinkAccess.create({
      data: { shareLinkId: link.id, ipAddress: ip, userAgent, downloaded: true },
    }).catch(() => {})

    // Increment download count
    prisma.shareLink.update({
      where: { id: link.id },
      data:  { downloadCount: { increment: 1 } },
    }).catch(() => {})

    return NextResponse.json({ url: presignedUrl, filename: target.name })
  }

  // ── ZIP download ───────────────────────────────────────────────────────────
  const pass    = new PassThrough()
  const archive = archiver('zip', { store: false, zlib: { level: 6 } })
  archive.on('error', (err) => {
    logger.warn('SHARE_ZIP_ARCHIVE_ERROR', {
      route: '/api/share/[token]/download',
      error: (err as Error)?.message,
      message: 'Archiver emitted an error during ZIP generation',
    })
    pass.destroy(err as Error)
  })
  archive.pipe(pass)

  ;(async () => {
    for (const file of allFiles) {
      const ext   = file.name.split('.').pop()?.toLowerCase() ?? ''
      const store = STORE_EXTS.has(ext)
      try {
        const url = await getPresignedDownloadUrl(file.r2Key, 900)
        const res = await fetch(url)
        if (!res.ok || !res.body) {
          logger.warn('SHARE_ZIP_SKIP', { route: '/api/share/[token]/download', metadata: { fileName: file.name }, message: 'Skipping file — fetch failed or no body' })
          continue
        }
        const stream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
        const entryName = file.folderPath
          ? `${file.folderPath.replace(/^\/|\/$/g, '')}/${file.name}`
          : file.name
        archive.append(stream, { name: entryName, ...(store ? { store: true } : {}) })
      } catch (err) {
        logger.warn('SHARE_ZIP_ERROR', { route: '/api/share/[token]/download', error: (err as Error)?.message, metadata: { fileName: file.name }, message: 'Error adding file to ZIP' })
      }
    }
    await archive.finalize()
  })().catch((err) => {
    logger.warn('SHARE_ZIP_PIPELINE_ERROR', {
      route: '/api/share/[token]/download',
      error: (err as Error)?.message,
      message: 'ZIP pipeline failed before completion',
    })
    archive.abort()
    pass.destroy(err as Error)
  })

  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      pass.on('data',  chunk => controller.enqueue(new Uint8Array(chunk)))
      pass.on('end',   ()    => controller.close())
      pass.on('error', err   => controller.error(err))
    },
    cancel() { archive.abort(); pass.destroy() },
  })

  // Log + increment download count (fire-and-forget)
  prisma.shareLinkAccess.create({
    data: { shareLinkId: link.id, ipAddress: ip, userAgent, downloaded: true },
  }).catch(() => {})
  prisma.shareLink.update({
    where: { id: link.id },
    data:  { downloadCount: { increment: 1 } },
  }).catch(() => {})

  const safeName = sanitizePath(link.title.replace(/[^a-zA-Z0-9 _-]/g, '_').substring(0, 60))
  return new NextResponse(webStream, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Transfer-Encoding':   'chunked',
    },
  })
}
