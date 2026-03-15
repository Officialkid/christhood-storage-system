import { NextRequest, NextResponse }          from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }                  from 'next-auth'
import { authOptions }                       from '@/lib/auth'
import { prisma }                            from '@/lib/prisma'
import { generateStoredName }                from '@/lib/uploadNaming'
import { notifyUploadInFollowedFolder }      from '@/lib/notifications'


/**
 * POST /api/upload/register
 *
 * Called after a successful simple (single-PUT) upload to create the MediaFile
 * record and log the activity.
 *
 * Body: { r2Key, originalName, contentType, fileSize, eventId, subfolderId? }
 *
 * storedName is generated server-side inside the transaction to avoid
 * race conditions when multiple files are uploaded concurrently.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    r2Key, originalName,
    contentType, fileSize, eventId, subfolderId,
  } = await req.json() as {
    r2Key:        string
    originalName: string
    contentType:  string
    fileSize:     number
    eventId:      string
    subfolderId?: string
  }

  if (!r2Key || !originalName || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const fileType = contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO'

  try {
    const mediaFile = await prisma.$transaction(async tx => {
      // Generate storedName atomically inside the transaction so concurrent
      // uploads always get distinct sequence numbers.
      const { storedName } = await generateStoredName(eventId, originalName, tx as any)

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
    import('@/lib/thumbnail')
      .then(({ generateAndStoreThumbnail }) =>
        generateAndStoreThumbnail(
          mediaFile.id,
          r2Key,
          fileType as 'PHOTO' | 'VIDEO',
          contentType,
          originalName,
        ).catch(() => {})
      )
      .catch(() => {})

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
    return handleApiError(err)
  }
}
