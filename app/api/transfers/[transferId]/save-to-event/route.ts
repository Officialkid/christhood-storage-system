import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { copyObject } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import { handleApiError } from '@/lib/apiError'

/**
 * POST /api/transfers/[transferId]/save-to-event
 * Body: { eventId: string, subfolderId?: string | null, source?: 'response' | 'original' }
 *
 * Copies TransferResponseFile(s) (or original TransferFile(s)) directly into a CMMS Event
 * (and optional Day subfolder) inside R2 without downloading & re-uploading!
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> },
) {
  const { transferId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { eventId, subfolderId, source = 'response' } = await req.json()
    if (!eventId) {
      return NextResponse.json({ error: 'Destination eventId is required' }, { status: 400 })
    }

    const [transfer, event] = await Promise.all([
      prisma.transfer.findUnique({
        where:   { id: transferId },
        include: { files: true, response: { include: { files: true } } },
      }),
      prisma.event.findUnique({
        where:   { id: eventId },
        include: { category: { include: { year: true } } },
      }),
    ])

    if (!transfer) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    if (!event)    return NextResponse.json({ error: 'Destination event not found' }, { status: 404 })

    const canAccess =
      transfer.senderId === session.user.id ||
      transfer.recipientId === session.user.id ||
      session.user.role === 'ADMIN'
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sourceFiles = source === 'response'
      ? (transfer.response?.files ?? [])
      : transfer.files

    if (sourceFiles.length === 0) {
      return NextResponse.json({ error: 'No files to import from this transfer.' }, { status: 400 })
    }

    const importedIds: string[] = []
    for (const f of sourceFiles) {
      const ext = f.originalName.split('.').pop()?.toLowerCase() ?? ''
      const isVideo = f.mimeType.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'].includes(ext)
      const isPhoto = f.mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'webp', 'tiff', 'tif', 'raw', 'cr2', 'nef', 'arw', 'dng'].includes(ext)
      if (!isVideo && !isPhoto) continue

      const destKey = `events/${event.category.year.year}/${event.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.originalName}`
      await copyObject(f.r2Key, destKey)

      const created = await prisma.mediaFile.create({
        data: {
          originalName: f.originalName,
          storedName:   f.originalName,
          r2Key:        destKey,
          fileType:     isVideo ? 'VIDEO' : 'PHOTO',
          fileSize:     f.fileSize,
          status:       source === 'response' ? 'EDITED' : 'RAW',
          uploaderId:   session.user.id,
          eventId:      event.id,
          subfolderId:  subfolderId || null,
        },
      })
      importedIds.push(created.id)
    }

    await log('TRANSFER_IMPORTED_TO_EVENT', session.user.id, {
      eventId: event.id,
      metadata: { transferId, importedCount: importedIds.length, source },
    }).catch(() => {})

    return NextResponse.json({ importedCount: importedIds.length, eventId: event.id })
  } catch (err) {
    return handleApiError(err, 'transfers/save-to-event')
  }
}
