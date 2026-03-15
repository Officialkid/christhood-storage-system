import { NextRequest, NextResponse }   from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'

const PREVIEW_EXPIRY_SECONDS = 60 * 60  // 1 hour

/**
 * GET /api/preview/[fileId]
 *
 * Returns a presigned R2 URL for in-browser preview of the file (image lightbox
 * or inline video player).  Intentionally does NOT create an activity-log entry
 * and does NOT modify file status — previewing is read-only.
 *
 * Response body:
 * {
 *   url:          string           presigned URL for the original file
 *   thumbnailUrl: string | null    presigned URL for the JPEG thumbnail (if generated)
 *   file: {
 *     id, originalName, fileType, fileSize, status, createdAt,
 *     versionCount,
 *     uploader: { username, email }
 *   }
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileId } = params

  try {
    const file = await prisma.mediaFile.findUnique({
      where:   { id: fileId },
      include: {
        uploader: { select: { username: true, email: true } },
        _count:   { select: { versions: true } },
      },
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Only non-deleted / non-purged files can be previewed by non-admins
    if (
      (file.status === 'DELETED' || file.status === 'PURGED') &&
      session.user.role !== 'ADMIN'
    ) {
      return NextResponse.json({ error: 'File not available' }, { status: 403 })
    }

    // Generate presigned URLs in parallel (thumbnail is optional)
    const [url, thumbnailUrl] = await Promise.all([
      getPresignedDownloadUrl(file.r2Key, PREVIEW_EXPIRY_SECONDS),
      file.thumbnailKey
        ? getPresignedDownloadUrl(file.thumbnailKey, PREVIEW_EXPIRY_SECONDS)
        : Promise.resolve(null),
    ])

    return NextResponse.json({
      url,
      thumbnailUrl,
      file: {
        id:           file.id,
        originalName: file.originalName,
        fileType:     file.fileType,
        fileSize:     file.fileSize.toString(),
        status:       file.status,
        createdAt:    file.createdAt.toISOString(),
        versionCount: file._count.versions,
        uploader: {
          username: file.uploader.username,
          email:    file.uploader.email,
        },
      },
    })
  } catch (err) {
    return handleApiError(err, 'preview')
  }
}
