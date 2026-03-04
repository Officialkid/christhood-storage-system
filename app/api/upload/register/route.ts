import { NextRequest, NextResponse }          from 'next/server'
import { getServerSession }                  from 'next-auth'
import { authOptions }                       from '@/lib/auth'
import { prisma }                            from '@/lib/prisma'
import { notifyUploadInFollowedFolder }      from '@/lib/notifications'
import { generateAndStoreThumbnail }         from '@/lib/thumbnail'

/**
 * POST /api/upload/register
 *
 * Called after a successful simple (single-PUT) upload to create the MediaFile
 * record and log the activity.
 *
 * Body: { r2Key, storedName, originalName, contentType, fileSize, eventId, subfolderId? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    r2Key, storedName, originalName,
    contentType, fileSize, eventId, subfolderId,
  } = await req.json() as {
    r2Key:        string
    storedName:   string
    originalName: string
    contentType:  string
    fileSize:     number
    eventId:      string
    subfolderId?: string
  }

  if (!r2Key || !storedName || !originalName || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const fileType = contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO'

  try {
    const mediaFile = await prisma.$transaction(async tx => {
      const mf = await tx.mediaFile.create({
        data: {
          originalName,
          storedName,
          r2Key,
          fileType,
          fileSize:    BigInt(fileSize),
          status:      'RAW',
          uploaderId:  session.user.id,
          eventId,
          subfolderId: subfolderId ?? null,
        },
      })
      await tx.activityLog.create({
        data: {
          action:      'FILE_UPLOADED',
          userId:      session.user.id,
          mediaFileId: mf.id,
          eventId,
          metadata: {
            originalName,
            storedName,
            fileType,
            fileSize,
            mode: 'simple',
          },
        },
      })
      return mf
    })

    // Fire-and-forget: generate thumbnail (never blocks the response)
    generateAndStoreThumbnail(
      mediaFile.id,
      r2Key,
      fileType as 'PHOTO' | 'VIDEO',
      contentType,
      originalName,
    ).catch(() => {})

    // Fire-and-forget: notify followers of this event folder
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

    return NextResponse.json(
      { mediaFile: { ...mediaFile, fileSize: mediaFile.fileSize.toString() } },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[register]', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
