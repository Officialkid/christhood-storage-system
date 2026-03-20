import { NextRequest, NextResponse }   from 'next/server'
import { getServerSession }             from 'next-auth'
import { authOptions }                  from '@/lib/auth'
import { prisma }                       from '@/lib/prisma'
import { getPresignedDownloadUrl }      from '@/lib/r2'
import { log }                          from '@/lib/activityLog'
import { createSHA256Transform }        from '@/lib/transferIntegrity'
import archiver                         from 'archiver'
import { PassThrough, Readable }        from 'stream'
import { format }                       from 'date-fns'
import { logger }                       from '@/lib/logger'

// Binary formats — stored without recompression to preserve zero-quality-loss guarantee
const STORE_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','mp4','mov','avi','heic',
  'raw','cr2','nef','arw','dng','orf','rw2','tiff','tif',
  'psd','ai','pdf','zip','rar','7z','gz',
])

/**
 * GET /api/transfers/[transferId]/response/download
 *
 * Streams a ZIP archive of all TransferResponseFiles back to the admin.
 * Admin only. Preserves recipient's folder structure inside the ZIP.
 * On first download sets TransferResponse.downloadedByAdmin = true.
 * Logs TRANSFER_RESPONSE_DOWNLOADED.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      response: { include: { files: true } },
    },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }
  if (!transfer.response) {
    return NextResponse.json({ error: 'No response has been submitted for this transfer' }, { status: 404 })
  }
  if (transfer.response.files.length === 0) {
    return NextResponse.json({ error: 'Response contains no files' }, { status: 404 })
  }

  // ── Build ZIP archive ──────────────────────────────────────────────────────
  const pass    = new PassThrough()
  const archive = archiver('zip', { store: false, zlib: { level: 6 } })
  archive.pipe(pass)

  const integrityFailures: Array<{ fileId: string; fileName: string }> = []

  ;(async () => {
    for (const file of transfer.response!.files) {
      const ext   = file.originalName.split('.').pop()?.toLowerCase() ?? ''
      const store = STORE_EXTENSIONS.has(ext)
      try {
        const url = await getPresignedDownloadUrl(file.r2Key, 900)
        const res = await fetch(url)
        if (!res.ok || !res.body) {
          logger.warn('RESPONSE_ZIP_SKIP', { route: '/api/transfers/response/download', transferId, message: `Skipping ${file.originalName}: R2 fetch failed` })
          continue
        }
        const rawStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
        const hashXform = createSHA256Transform()
        const piped     = rawStream.pipe(hashXform)

        // Verify checksum after bytes have been fully consumed by the archive
        if (file.checksum) {
          const capturedId   = file.id
          const capturedName = file.originalName
          const storedHash   = file.checksum.toLowerCase()
          const userId       = session.user.id
          hashXform.once('finish', () => {
            const actual = hashXform.getDigest()
            if (actual !== storedHash) {
              integrityFailures.push({ fileId: capturedId, fileName: capturedName })
              log('TRANSFER_INTEGRITY_FAILURE', userId, {
                metadata: { transferId, fileId: capturedId, fileName: capturedName,
                            expected: storedHash, actual, source: 'response-zip-download' },
              }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/response/download', transferId, error: (e as Error)?.message, message: 'Integrity log failed' }))
            }
          })
        }

        const entryName  = file.folderPath
          ? `${file.folderPath.replace(/^\/|\/$/g, '')}/${file.originalName}`
          : file.originalName

        if (store) {
          archive.append(piped, { name: entryName, store: true })
        } else {
          archive.append(piped, { name: entryName })
        }
      } catch (err) {
        logger.warn('RESPONSE_ZIP_ERROR', { route: '/api/transfers/response/download', transferId, error: (err as Error)?.message, message: `Error adding ${file.originalName} to response ZIP` })
      }
    }
    archive.finalize()
  })()

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

  // Side-effects (non-blocking) ───────────────────────────────────────────────

  // Mark admin as having downloaded this response
  if (!transfer.response.downloadedByAdmin) {
    prisma.transferResponse.update({
      where: { id: transfer.response.id },
      data:  { downloadedByAdmin: true },
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/response/download', transferId, error: (e as Error)?.message, message: 'downloadedByAdmin update failed' }))
  }

  // Activity log
  log('TRANSFER_RESPONSE_DOWNLOADED', session.user.id, {
    metadata: {
      transferId,
      subject:   transfer.subject,
      fileCount: transfer.response.files.length,
    },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/response/download', transferId, error: (e as Error)?.message, message: 'Activity log failed' }))

  // ── Build filename: Subject_RESPONSE_YYYYMMDD.zip ─────────────────────────
  const safeSubject  = transfer.subject.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim().replace(/\s+/g, '_').slice(0, 60)
  const dateStamp    = format(new Date(), 'yyyyMMdd')
  const zipFileName  = `${safeSubject}_RESPONSE_${dateStamp}.zip`

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
      'Transfer-Encoding':   'chunked',
      'Cache-Control':       'no-store',
    },
  })
}
