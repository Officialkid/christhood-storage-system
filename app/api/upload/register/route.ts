import { NextRequest, NextResponse }          from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }                  from 'next-auth'
import { authOptions }                       from '@/lib/auth'
import { prisma }                            from '@/lib/prisma'
import { sanitizeFilename }                  from '@/lib/uploadNaming'
import { notifyUploadInFollowedFolder }      from '@/lib/notifications'
import { logger }                            from '@/lib/logger'


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
    contentType, fileSize, eventId, subfolderId, force, versionOf,
  } = await req.json() as {
    r2Key:        string
    originalName: string
    contentType:  string
    fileSize:     number
    eventId:      string
    subfolderId?: string
    force?:       boolean
    versionOf?:   string   // existing MediaFile ID — create a FileVersion instead of a new MediaFile
  }

  if (!r2Key || !originalName || !contentType || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const fileType = contentType.startsWith('video/') ? 'VIDEO' : 'PHOTO'

  try {
    const storedName = sanitizeFilename(originalName)

    // ── Version upload path ───────────────────────────────────────────────────
    // When versionOf is supplied, attach this upload as a new FileVersion on the
    // existing MediaFile rather than creating a brand-new record.
    if (versionOf) {
      const result = await prisma.$transaction(async tx => {
        const maxVer = await tx.fileVersion.findFirst({
          where:   { mediaFileId: versionOf },
          orderBy: { versionNumber: 'desc' },
          select:  { versionNumber: true },
        })
        const nextVer = (maxVer?.versionNumber ?? 1) + 1
        const ver = await tx.fileVersion.create({
          data: {
            mediaFileId:  versionOf,
            versionNumber: nextVer,
            r2Key,
            uploadedById: session.user.id,
          },
        })
        await tx.activityLog.create({
          data: {
            action:      'FILE_VERSION_UPLOADED',
            userId:      session.user.id,
            mediaFileId: versionOf,
            eventId,
            metadata: { originalName, versionNumber: nextVer, r2Key, mode: 'simple' },
          },
        })
        return { versionNumber: nextVer, mediaFileId: versionOf, versionId: ver.id }
      })
      return NextResponse.json({ version: result }, { status: 201 })
    }

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

    logger.info('FILE_UPLOADED', {
      userId:   session.user.id,
      userRole: session.user.role as string,
      route:    '/api/upload/register',
      fileId:   mediaFile.id,
      eventId,
      message:  `${session.user.username ?? session.user.name ?? session.user.email} uploaded ${originalName}`,
      metadata: { originalName, fileSize, fileType, mode: 'simple' },
    })

    return NextResponse.json(
      { mediaFile: { ...mediaFile, fileSize: mediaFile.fileSize.toString() } },
      { status: 201 },
    )
  } catch (err: any) {
    logger.error('FILE_UPLOAD_FAILED', {
      userId:    session.user.id,
      route:     '/api/upload/register',
      error:     err?.message,
      errorCode: err?.code,
      message:   `Upload registration failed for ${originalName ?? 'unknown'}`,
      metadata:  { originalName, fileSize, r2Key, eventId },
    })
    return handleApiError(err)
  }
}
