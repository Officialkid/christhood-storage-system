import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'
import { log }                        from '@/lib/activityLog'
import { logger }                     from '@/lib/logger'

function toFlatDownloadName(originalName: string, folderPath: string | null) {
  if (!folderPath) return originalName
  const prefix = folderPath
    .replace(/[\\/]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${prefix} - ${originalName}`
}

/**
 * GET /api/transfers/[transferId]/response/files/[fileId]
 *
 * Returns a short-lived presigned R2 download URL for a single response file.
 * Sender or admin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string; fileId: string }> }
) {
  const { transferId, fileId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { id: true, senderId: true, response: { select: { id: true, downloadedByAdmin: true } } },
  })
  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  const canAccess =
    transfer.senderId === session.user.id ||
    session.user.role === 'ADMIN'

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden — sender or admin only' }, { status: 403 })
  }
  if (!transfer.response) {
    return NextResponse.json({ error: 'No response for this transfer' }, { status: 404 })
  }

  const file = await prisma.transferResponseFile.findFirst({
    where:  { id: fileId, responseId: transfer.response.id },
    select: { r2Key: true, originalName: true, folderPath: true },
  })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  if (!transfer.response.downloadedByAdmin) {
    prisma.transferResponse.update({
      where: { id: transfer.response.id },
      data:  { downloadedByAdmin: true },
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', {
      route: '/api/transfers/[transferId]/response/files/[fileId]',
      transferId,
      error: (e as Error)?.message,
      message: 'downloadedByAdmin update failed',
    }))
  }

  log('TRANSFER_RESPONSE_DOWNLOADED', session.user.id, {
    metadata: {
      transferId,
      fileId,
      subject: 'single-response-file',
      fileCount: 1,
    },
  }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', {
    route: '/api/transfers/[transferId]/response/files/[fileId]',
    transferId,
    error: (e as Error)?.message,
    message: 'Activity log failed',
  }))

  const url = await getPresignedDownloadUrl(file.r2Key, 3600)
  return NextResponse.json({
    url,
    filename: file.originalName,
    downloadName: toFlatDownloadName(file.originalName, file.folderPath ?? null),
  })
}
