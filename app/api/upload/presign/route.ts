import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { getPresignedUploadUrl, createMultipartUpload } from '@/lib/r2'
import { makeEventR2Key }            from '@/lib/uploadNaming'
import { prisma }                    from '@/lib/prisma'

// Files below this threshold use a single presigned PUT; larger files use multipart.
const MULTIPART_THRESHOLD = 5  * 1024 * 1024  //   5 MB
const PART_SIZE           = 10 * 1024 * 1024  //  10 MB (> R2's 5 MB minimum)

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

  // Validate MIME type — only photos and videos are accepted
  const isImage = contentType.startsWith('image/')
  const isVideo = contentType.startsWith('video/')
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
      const uploadId   = await createMultipartUpload(r2Key, contentType)
      const totalParts = Math.ceil(fileSize / PART_SIZE)

      return NextResponse.json({
        mode:         'multipart',
        uploadId,
        r2Key,
        originalName: filename,
        partSize:     PART_SIZE,
        totalParts,
      })
    } else {
      // ── Simple presigned PUT ─────────────────────────────────────────────────
      const uploadUrl = await getPresignedUploadUrl(r2Key, contentType)

      return NextResponse.json({
        mode:         'simple',
        uploadUrl,
        r2Key,
        originalName: filename,
      })
    }
  } catch (err: any) {
    console.error('[presign]', err)
    return handleApiError(err)
  }
}
