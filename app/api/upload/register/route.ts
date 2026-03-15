import { NextRequest, NextResponse }          from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }                  from 'next-auth'
import { authOptions }                       from '@/lib/auth'
import { prisma }                            from '@/lib/prisma'
import { sanitizeFilename }                  from '@/lib/uploadNaming'
import { notifyUploadInFollowedFolder }      from '@/lib/notifications'


/**
 * POST /api/upload/register
 *
 * Called after a successful simple (single-PUT) upload to create the MediaFile
 * record and log the activity.
 *
 * Body: { r2Key, originalName, contentType, fileSize, eventId, subfolderId?, force? }
 *
 * When force:true is passed, an existing MediaFile with the same r2Key is
 * replaced (its fields are updated in-place rather than creating a duplicate).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    r2Key, originalName,
    contentType, fileSize, eventId, subfolderId, force,
  } = await req.json() as {
    r2Key:        string
    originalName: string
    contentType:  string
    fileSize:     number
    eventId:      string
    subfolderId?: string
    force?:       boolean
  }

  if (!r2Key || !originalName || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const fileType = contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO'

  try {
    const storedName = sanitizeFilename(originalName)

    const mediaFile = await prisma.$transaction(async tx => {
      // When force:true, update the existing record instead of creating a duplicate.
      if (force) {
        const existingFile = await tx.mediaFile.findFirst({ where: { r2Key, eventId } })
        if (existingFile) {
          const mf = await tx.mediaFile.update({
            where: { id: existingFile.id },
            data: {
              originalName,
              storedName,
              fileType:   fileType as any,
              fileSize:   BigInt(fileSize),
              uploaderId: session.user.id,
            },
          })
          await tx.activityLog.create({
            data: {
              action:      'FILE_REPLACED',
              userId:      session.user.id,
              mediaFileId: mf.id,
              eventId,
              metadata: { originalName, storedName, fileType, fileSize, mode: 'simple' },
            },
          })
          return mf
        }
      }

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
