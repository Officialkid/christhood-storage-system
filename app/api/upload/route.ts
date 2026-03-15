import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPresignedUploadUrl } from '@/lib/r2'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * POST /api/upload
 *
 * Body: { filename: string, contentType: string, sizeBytes: number, eventId?: string }
 *
 * Returns a presigned R2 PUT URL and the new media record id.
 * The client uploads directly to R2, then calls PATCH /api/media/:id to mark it READY.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { filename, contentType, sizeBytes, eventId } = body

  if (!filename || !contentType || !sizeBytes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Determine media type from MIME
  const fileType = contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO'

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  // Guard: verify the event exists before creating DB records or presigning
  const eventExists = await prisma.event.count({ where: { id: eventId } })
  if (!eventExists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Unique storage key: uploads/<userId>/<uuid>-<filename>
  const storedName = `${randomUUID()}-${filename}`
  const r2Key      = `uploads/${session.user.id}/${storedName}`

  try {
    const [uploadUrl, mediaFile] = await Promise.all([
      getPresignedUploadUrl(r2Key, contentType),
      prisma.mediaFile.create({
        data: {
          originalName: filename,
          storedName,
          r2Key,
          fileType,
          fileSize:   BigInt(sizeBytes),
          status:     'RAW',
          uploaderId: session.user.id,
          eventId,
        },
      }),
    ])
    return NextResponse.json({ uploadUrl, r2Key, mediaId: mediaFile.id })
  } catch (err: any) {
    return handleApiError(err, 'upload/route')
  }
}
