import { NextRequest, NextResponse }     from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }             from 'next-auth'
import { authOptions }                  from '@/lib/auth'
import {
  getPresignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
}                                       from '@/lib/r2'
import { prisma }                       from '@/lib/prisma'
import { sanitizeFilename }             from '@/lib/uploadNaming'
import { generateAndStoreThumbnail }    from '@/lib/thumbnail'
import { notifyUploadInFollowedFolder } from '@/lib/notifications'
import { logger }                        from '@/lib/logger'

/**
 * POST /api/upload/multipart
 *
 * action:'part'
 *   Body:    { r2Key, uploadId, partNumber }
 *   Returns: { url }
 *
 * action:'complete'
 *   Body:    { r2Key, uploadId, parts:[{PartNumber,ETag}], originalName, storedName,
 *              fileType, fileSize, eventId, subfolderId? }
 *   Returns: { mediaFile }
 *
 * action:'abort'
 *   Body:    { r2Key, uploadId }
 *   Returns: { ok: true }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { action } = body as { action: 'part' | 'complete' | 'abort' }

  // ── GET PRESIGNED PART URL ──────────────────────────────────────────────────
  if (action === 'part') {
    const { r2Key, uploadId, partNumber } = body as {
      r2Key:      string
      uploadId:   string
      partNumber: number
    }
    if (!r2Key || !uploadId || !partNumber) {
      return NextResponse.json({ error: 'Missing r2Key / uploadId / partNumber' }, { status: 400 })
    }
    try {
      const url = await getPresignedPartUrl(r2Key, uploadId, partNumber)
      return NextResponse.json({ url })
    } catch (err: any) {
      logger.error('FILE_UPLOAD_FAILED', { route: '/api/upload/multipart', error: err?.message, errorCode: err?.code, message: 'Presigned part URL failed' })
      return handleApiError(err)
    }
  }

  // ── COMPLETE MULTIPART + REGISTER ──────────────────────────────────────────
  if (action === 'complete') {
    const {
      r2Key, uploadId, parts,
      originalName, fileType, fileSize,
      eventId, subfolderId,
    } = body as {
      r2Key:        string
      uploadId:     string
      parts:        { PartNumber: number; ETag: string }[]
      originalName: string
      fileType:     'PHOTO' | 'VIDEO'
      fileSize:     number
      eventId:      string
      subfolderId?: string
    }

    if (!r2Key || !uploadId || !parts?.length || !originalName
        || !eventId || !fileSize) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    try {
      // 1. Tell R2 to assemble the parts
      await completeMultipartUpload(r2Key, uploadId, parts)

      // 2. Create the DB record in a transaction alongside the activity log.
      const storedName = sanitizeFilename(originalName)
      const mediaFile = await prisma.$transaction(async tx => {
        const mf = await tx.mediaFile.create({
          data: {
            originalName,
            storedName,
            r2Key,
            fileType:   fileType ?? 'PHOTO',
            fileSize:   BigInt(fileSize),
            status:     'RAW',
            uploaderId: session.user.id,
            eventId,
            subfolderId: subfolderId ?? null,
          },
        })
        await tx.activityLog.create({
          data: {
            action:     'FILE_UPLOADED',
            userId:     session.user.id,
            mediaFileId: mf.id,
            eventId,
            metadata: {
              originalName,
              storedName,
              fileType,
              fileSize,
              mode: 'multipart',
            },
          },
        })
        return mf
      })

      // Fire-and-forget: generate thumbnail (never blocks the response)
      const _ft = (fileType ?? 'PHOTO') as 'PHOTO' | 'VIDEO'
      const _ct = _ft === 'VIDEO' ? 'video/mp4' : 'image/jpeg'
      import('@/lib/thumbnail')
        .then(({ generateAndStoreThumbnail }) =>
          generateAndStoreThumbnail(mediaFile.id, r2Key, _ft, _ct, originalName).catch(() => {})
        )
        .catch(() => {})

      // Fire-and-forget: notify followers
      prisma.event.findUnique({ where: { id: eventId }, select: { name: true } })
        .then((ev) => {
          if (ev) {
            notifyUploadInFollowedFolder({
              eventId,
              eventName:  ev.name,
              fileName:   originalName,
              uploaderId: session.user.id,
              fileId:     mediaFile.id,
            }).catch(() => {})
          }
        })
        .catch(() => {})

      return NextResponse.json({ mediaFile: { ...mediaFile, fileSize: mediaFile.fileSize.toString() } })
    } catch (err: any) {
      logger.error('FILE_UPLOAD_FAILED', { route: '/api/upload/multipart', error: err?.message, errorCode: err?.code, message: 'Multipart complete failed' })
      // Attempt to abort to avoid orphaned partial uploads
      try { await abortMultipartUpload(r2Key, uploadId) } catch {}
      return handleApiError(err)
    }
  }

  // ── ABORT ──────────────────────────────────────────────────────────────────
  if (action === 'abort') {
    const { r2Key, uploadId } = body as { r2Key: string; uploadId: string }
    if (!r2Key || !uploadId) {
      return NextResponse.json({ error: 'Missing r2Key / uploadId' }, { status: 400 })
    }
    try {
      await abortMultipartUpload(r2Key, uploadId)
      return NextResponse.json({ ok: true })
    } catch (err: any) {
      logger.warn('FILE_UPLOAD_ABORTED', { route: '/api/upload/multipart', error: err?.message, message: 'Multipart abort failed — upload may still be active in R2' })
      return handleApiError(err)
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
