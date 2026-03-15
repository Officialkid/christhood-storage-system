import { NextRequest, NextResponse }           from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }                   from 'next-auth'
import { authOptions }                        from '@/lib/auth'
import { completeMultipartUpload }            from '@/lib/r2'
import { prisma }                             from '@/lib/prisma'
import { sanitizeFilename }                   from '@/lib/uploadNaming'
import { notifyUploadInFollowedFolder }       from '@/lib/notifications'

/**
 * POST /api/upload/multipart/complete
 *
 * Step 4 (final) of the parallel multipart upload protocol.
 *
 * 1. Calls R2's CompleteMultipartUpload — R2 verifies all ETags and assembles
 *    every uploaded chunk into the final object. This is atomic on R2's side.
 * 2. Creates the MediaFile Prisma record inside a transaction with the
 *    sequential storedName generator (race-condition-safe).
 * 3. Fires thumbnail generation and folder-follow notifications (background).
 *
 * Body:    { uploadId, key, parts: [{PartNumber, ETag}],
 *            originalName, fileType?, fileSize, eventId, subfolderId? }
 * Returns: { success: true, mediaFile: { id, storedName, r2Key }, finalKey, fileSize }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    uploadId?:     string
    key?:          string
    parts?:        { PartNumber: number; ETag: string }[]
    originalName?: string
    fileType?:     'PHOTO' | 'VIDEO'
    fileSize?:     number
    eventId?:      string
    subfolderId?:  string
    force?:        boolean
    versionOf?:    string   // existing MediaFile ID — create a FileVersion
  }

  const { uploadId, key, parts, originalName, fileType, fileSize, eventId, subfolderId, force, versionOf } = body

  if (!uploadId || !key || !Array.isArray(parts) || !parts.length
      || !originalName || !fileSize || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Derive file type from either the explicit field or the file extension
  const resolvedType: 'PHOTO' | 'VIDEO' =
    fileType ?? (/\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(originalName) ? 'VIDEO' : 'PHOTO')

  try {
    // ── 1. Tell R2 to assemble all parts ──────────────────────────────────────
    await completeMultipartUpload(key, uploadId, parts)

    // ── 2. Create (or replace) DB record ─────────────────────────────────────
    const storedName = sanitizeFilename(originalName)

    // ── Version upload path ────────────────────────────────────────────────
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
            mediaFileId:   versionOf,
            versionNumber: nextVer,
            r2Key:         key,
            uploadedById:  session.user.id,
          },
        })
        await tx.activityLog.create({
          data: {
            action:      'FILE_VERSION_UPLOADED',
            userId:      session.user.id,
            mediaFileId: versionOf,
            eventId,
            metadata: {
              originalName,
              versionNumber: nextVer,
              r2Key: key,
              mode: 'multipart-parallel',
            },
          },
        })
        return { versionNumber: nextVer, mediaFileId: versionOf, versionId: ver.id }
      })
      return NextResponse.json({
        success:       true,
        versionNumber: result.versionNumber,
        mediaFileId:   result.mediaFileId,
        finalKey:      key,
        fileSize,
      })
    }

    const mediaFile = await prisma.$transaction(async tx => {
      // When force:true, update the existing record instead of creating a duplicate.
      if (force) {
        const existingFile = await tx.mediaFile.findFirst({ where: { r2Key: key, eventId } })
        if (existingFile) {
          const mf = await tx.mediaFile.update({
            where: { id: existingFile.id },
            data: {
              originalName,
              storedName,
              fileType:   resolvedType,
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
              metadata: { originalName, storedName, fileType: resolvedType, fileSize, mode: 'multipart-parallel' },
            },
          })
          return mf
        }
      }

      const mf = await tx.mediaFile.create({
        data: {
          originalName,
          storedName,
          r2Key:       key,
          fileType:    resolvedType,
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
            fileType: resolvedType,
            fileSize,
            mode: 'multipart-parallel',
          },
        },
      })

      return mf
    })

    // ── 3. Background: thumbnail generation ───────────────────────────────────
    const _ct = resolvedType === 'VIDEO' ? 'video/mp4' : 'image/jpeg'
    import('@/lib/thumbnail')
      .then(({ generateAndStoreThumbnail }) =>
        generateAndStoreThumbnail(mediaFile.id, key, resolvedType, _ct, originalName).catch(() => {}),
      )
      .catch(() => {})

    // ── 4. Background: folder-follow notifications ────────────────────────────
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } })
      .then(ev => {
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

    return NextResponse.json({
      success:  true,
      mediaFile: {
        id:         mediaFile.id,
        storedName: mediaFile.storedName,
        r2Key:      key,
      },
      finalKey: key,
      fileSize,
    })
  } catch (err: any) {
    return handleApiError(err, 'multipart/complete')
  }
}
