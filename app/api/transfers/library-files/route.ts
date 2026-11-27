import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'

/**
 * GET /api/transfers/library-files?eventId=...&subfolderId=...
 * Returns active MediaFiles inside a CMMS Event (or Day subfolder) so users can attach
 * existing CMMS photos/videos directly to a Transfer without re-uploading from disk!
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const eventId     = req.nextUrl.searchParams.get('eventId')
  const subfolderId = req.nextUrl.searchParams.get('subfolderId')

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  const files = await prisma.mediaFile.findMany({
    where: {
      eventId,
      ...(subfolderId ? { subfolderId } : {}),
      status: { notIn: ['DELETED', 'PURGED'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id:           true,
      originalName: true,
      fileType:     true,
      fileSize:     true,
      status:       true,
      thumbnailKey: true,
      r2Key:        true,
      subfolder:    { select: { label: true } },
    },
  })

  const enriched = await Promise.all(
    files.map(async (f) => {
      let thumbUrl: string | null = null
      if (f.thumbnailKey) {
        thumbUrl = await getPresignedDownloadUrl(f.thumbnailKey, 3600).catch(() => null)
      } else if (f.fileType === 'PHOTO') {
        thumbUrl = await getPresignedDownloadUrl(f.r2Key, 3600).catch(() => null)
      }
      return {
        id:             f.id,
        originalName:   f.originalName,
        fileType:       f.fileType,
        fileSize:       Number(f.fileSize),
        status:         f.status,
        subfolderLabel: f.subfolder?.label ?? null,
        thumbnailUrl:   thumbUrl,
      }
    }),
  )

  return NextResponse.json({ files: enriched })
}
