import { NextRequest, NextResponse }   from 'next/server'
import { getServerSession }             from 'next-auth'
import { authOptions }                  from '@/lib/auth'
import { prisma }                       from '@/lib/prisma'
import { getPresignedDownloadUrl }      from '@/lib/r2'
import { log }                          from '@/lib/activityLog'
import { createSHA256Transform }        from '@/lib/transferIntegrity'
import archiver                         from 'archiver'
import { PassThrough, Readable }        from 'stream'
import { logger }                        from '@/lib/logger'

// Binary formats — stored without recompression to preserve integrity
const STORE_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','mp4','mov','avi','heic',
  'raw','cr2','nef','arw','dng','orf','rw2','tiff','tif',
  'psd','ai','pdf','zip','rar','7z','gz',
])

/**
 * GET /api/transfers/[transferId]/download
 *
 * Streams a ZIP archive of all TransferFiles to the browser.
 * Only the assigned recipient or an ADMIN may download.
 * On first download: sets Transfer.status → DOWNLOADED and logs the action.
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

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: { files: true, sender: { select: { username: true, name: true } } },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  // Access check — recipient or admin only
  const isRecipient = transfer.recipientId === session.user.id
  const isAdmin     = session.user.role === 'ADMIN'
  if (!isRecipient && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Block downloads for cancelled / purged transfers
  if (transfer.status === 'EXPIRED') {
    return NextResponse.json({ error: 'Transfer has been cancelled or has expired' }, { status: 410 })
  }

  if (transfer.files.length === 0) {
    return NextResponse.json({ error: 'No files in this transfer' }, { status: 404 })
  }

  // ── Build ZIP archive ──────────────────────────────────────────────────────
  const pass    = new PassThrough()
  const archive = archiver('zip', { store: false, zlib: { level: 6 } })
  archive.pipe(pass)

  const integrityFailures: Array<{ fileId: string; fileName: string }> = []

  ;(async () => {
    for (const file of transfer.files) {
      const ext  = file.originalName.split('.').pop()?.toLowerCase() ?? ''
      const store = STORE_EXTENSIONS.has(ext)

      try {
        const url = await getPresignedDownloadUrl(file.r2Key, 900)
        const res = await fetch(url)
        if (!res.ok || !res.body) {
          logger.warn('TRANSFER_ZIP_SKIP', { route: '/api/transfers/download', transferId, message: `Skipping ${file.originalName}: R2 fetch failed` })
          continue
        }
        const rawStream  = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
        const hashXform  = createSHA256Transform()
        const piped      = rawStream.pipe(hashXform)

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
                            expected: storedHash, actual, source: 'zip-download' },
              }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/download', transferId, error: (e as Error)?.message, message: 'Integrity log failed' }))
            }
          })
        }

        // Reconstruct folder path inside ZIP
        const entryName = file.folderPath
          ? `${file.folderPath.replace(/^\/|\/$/g, '')}/${file.originalName}`
          : file.originalName

        if (store) {
          archive.append(piped, { name: entryName, store: true })
        } else {
          archive.append(piped, { name: entryName })
        }
      } catch (err) {
        logger.warn('TRANSFER_ZIP_ERROR', { route: '/api/transfers/download', transferId, error: (err as Error)?.message, message: `Error adding ${file.originalName} to ZIP` })
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

  // Mark as DOWNLOADED on first download (non-blocking)
  if (transfer.status === 'PENDING') {
    prisma.transfer.update({
      where: { id: transferId },
      data:  { status: 'DOWNLOADED' },
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/download', transferId, error: (e as Error)?.message, message: 'Status update to DOWNLOADED failed' }))
  }

  // Activity log (non-blocking)
  log('TRANSFER_DOWNLOADED', session.user.id, {
    metadata: {
      transferId,
      subject:   transfer.subject,
      fileCount: transfer.files.length,
    },
  }).catch(e => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/download', transferId, error: (e as Error)?.message, message: 'Activity log failed' }))

  const senderLabel = transfer.sender.username ?? transfer.sender.name ?? 'transfer'
  const dateLabel   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const zipName     = `${transfer.subject.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)}_${dateLabel}.zip`

  return new Response(webStream, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-store',
    },
  })
}
