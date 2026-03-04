import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { getPresignedUploadUrl, createMultipartUpload } from '@/lib/r2'
import { generateStoredName }        from '@/lib/uploadNaming'
import { prisma }                    from '@/lib/prisma'

// Files below this threshold use a single presigned PUT; larger files use multipart.
const MULTIPART_THRESHOLD = 50 * 1024 * 1024  //  50 MB
const PART_SIZE           = 8  * 1024 * 1024  //   8 MB (> R2's 5 MB minimum)

/**
 * POST /api/upload/presign
 *
 * Body: { filename, contentType, fileSize, eventId, subfolderId? }
 *
 * Small files  → { mode:'simple',    uploadUrl, r2Key, storedName, originalName }
 * Large files  → { mode:'multipart', uploadId,  r2Key, storedName, originalName, partSize, totalParts }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename, contentType, fileSize, eventId, subfolderId } =
    await req.json() as {
      filename:    string
      contentType: string
      fileSize:    number
      eventId:     string
      subfolderId?: string
    }

  if (!filename || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the event exists before generating a name
  const eventExists = await prisma.event.count({ where: { id: eventId } })
  if (!eventExists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  try {
    const { storedName, r2Key } = await generateStoredName(eventId, filename, prisma)

    if (fileSize >= MULTIPART_THRESHOLD) {
      // ── Multipart path ──────────────────────────────────────────────────────
      const uploadId  = await createMultipartUpload(r2Key, contentType)
      const totalParts = Math.ceil(fileSize / PART_SIZE)

      return NextResponse.json({
        mode:         'multipart',
        uploadId,
        r2Key,
        storedName,
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
        storedName,
        originalName: filename,
      })
    }
  } catch (err: any) {
    console.error('[presign]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
