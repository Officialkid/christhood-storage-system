import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { getPresignedUploadUrl, createMultipartUpload } from '@/lib/r2'
import { makeEventR2Key }            from '@/lib/uploadNaming'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'

// Files below this threshold use a single presigned PUT; larger files use multipart.
// Must match MULTIPART_THRESHOLD in UploadZone.tsx (10 MB).
const MULTIPART_THRESHOLD = 10 * 1024 * 1024  //  10 MB
const PART_SIZE           = 10 * 1024 * 1024  //  10 MB (> R2's 5 MB minimum)

/**
 * Resolve a reliable MIME type from the client-supplied type and the file extension.
 * Browsers (especially on iOS) often return an empty string for .mov/.mp4 files.
 * Falls back to extension-based detection so we never send 'application/octet-stream'
 * as the Content-Type when signing the presigned PUT URL.
 */
function resolveMimeType(fileName: string, clientType: string): string {
  if (clientType && clientType.includes('/') && clientType !== 'application/octet-stream') {
    return clientType
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp', heic: 'image/heic',
    heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    raw: 'image/x-raw', cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef',
    mp4: 'video/mp4',  mov: 'video/quicktime',   avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
    m4v: 'video/x-m4v',      wmv: 'video/x-ms-wmv',
  }
  return map[ext] ?? clientType ?? 'application/octet-stream'
}

/**
 * POST /api/upload/presign
 *
 * Body: { filename, contentType, fileSize, eventId, subfolderId?, force? }
 *
 * Small files  → { mode:'simple',    uploadUrl, r2Key, originalName }
 * Large files  → { mode:'multipart', uploadId,  r2Key, originalName, partSize, totalParts }
 *
 * Returns 409 { error:'duplicate', existingId, existingName } when a file with
 * the same name already exists in the event, unless force:true is passed.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename, contentType, fileSize, eventId, subfolderId, force, checkOnly } =
    await req.json() as {
      filename:     string
      contentType:  string
      fileSize:     number
      eventId:      string
      subfolderId?: string
      force?:       boolean
      checkOnly?:   boolean
    }

  if (!filename || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve a proper MIME type — never trust empty string or octet-stream from client
  const mimeType = resolveMimeType(filename, contentType)

  // Validate MIME type — only photos and videos are accepted
  const isImage = mimeType.startsWith('image/')
  const isVideo = mimeType.startsWith('video/')
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: 'Invalid file type. Only photo (image/*) and video (video/*) files are accepted.' },
      { status: 415 }
    )
  }

  // Verify the event exists before generating a key
  const eventExists = await prisma.event.count({ where: { id: eventId } })
  if (!eventExists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  try {
    const r2Key = makeEventR2Key(eventId, filename)

    // Duplicate check — same filename already uploaded to this event?
    if (!force) {
      const existing = await prisma.mediaFile.findFirst({
        where:  { r2Key, eventId },
        select: { id: true, originalName: true },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'duplicate', existingId: existing.id, existingName: existing.originalName },
          { status: 409 },
        )
      }
    }

    // checkOnly — caller just wants the duplicate check; no R2 session needed.
    if (checkOnly) {
      return NextResponse.json({ isDuplicate: false })
    }

    if (fileSize >= MULTIPART_THRESHOLD) {
      // ── Multipart path ──────────────────────────────────────────────────────
      const uploadId   = await createMultipartUpload(r2Key, mimeType)
      const totalParts = Math.ceil(fileSize / PART_SIZE)

      return NextResponse.json({
        mode:         'multipart',
        uploadId,
        r2Key,
        originalName: filename,
        partSize:     PART_SIZE,
        totalParts,
        mimeType,
      })
    } else {
      // ── Simple presigned PUT ─────────────────────────────────────────────────
      // The presigned URL is signed with mimeType as Content-Type.
      // The client MUST send the same value as the PUT Content-Type header.
      const uploadUrl = await getPresignedUploadUrl(r2Key, mimeType)

      return NextResponse.json({
        mode:         'simple',
        uploadUrl,
        mimeType,
        r2Key,
        originalName: filename,
      })
    }
  } catch (err: any) {
    logger.error('PRESIGN_FAILED', { route: '/api/upload/presign', error: err?.message, errorCode: err?.code, message: 'Failed to generate presigned upload URL' })
    return handleApiError(err)
  }
}
