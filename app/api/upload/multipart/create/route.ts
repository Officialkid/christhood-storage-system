import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { createMultipartUpload }     from '@/lib/r2'
import { makeEventR2Key }            from '@/lib/uploadNaming'
import { prisma }                    from '@/lib/prisma'

const CHUNK_SIZE = 10 * 1024 * 1024  // 10 MB — must match lib/upload/multipart-uploader.ts

/**
 * POST /api/upload/multipart/create
 *
 * Step 1 of the parallel multipart upload protocol.
 * Initiates a new R2 multipart upload session and returns the uploadId,
 * the generated R2 key, and the chunk size the client should use.
 *
 * Body:    { fileName, fileSize, mimeType, eventId, subfolderId?, force? }
 * Returns: { uploadId, key, chunkSize, totalChunks }
 *
 * Returns 409 { error:'duplicate', existingId, existingName } when a file with
 * the same name already exists in the event, unless force:true is passed.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    fileName?:    string
    fileSize?:    number
    mimeType?:    string
    eventId?:     string
    subfolderId?: string
    force?:       boolean
  }

  const { fileName, fileSize, mimeType, eventId, subfolderId, force } = body

  if (!fileName || !fileSize || !mimeType || !eventId) {
    return NextResponse.json({ error: 'Missing required fields: fileName, fileSize, mimeType, eventId' }, { status: 400 })
  }

  const isImage = mimeType.startsWith('image/')
  const isVideo = mimeType.startsWith('video/')
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: 'Only image/* and video/* files are accepted.' },
      { status: 415 },
    )
  }

  const eventExists = await prisma.event.count({ where: { id: eventId } })
  if (!eventExists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  try {
    const r2Key = makeEventR2Key(eventId, fileName)

    // Duplicate check
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

    const uploadId    = await createMultipartUpload(r2Key, mimeType)
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

    return NextResponse.json({ uploadId, key: r2Key, chunkSize: CHUNK_SIZE, totalChunks })
  } catch (err: any) {
    return handleApiError(err, 'multipart/create')
  }
}
