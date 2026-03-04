import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

/**
 * POST /api/media/[fileId]/versions/confirm
 *
 * Called AFTER the client has successfully PUT the file to R2 via the presigned URL.
 * Body: { r2Key: string; nextVersion: number; storedName: string; originalName?: string; fileSize?: number }
 *
 * Steps:
 *  1. Creates a FileVersion record for the new version.
 *  2. Updates MediaFile.r2Key → the new key (and optionally name / size).
 *  3. Logs VERSION_UPLOADED.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string
  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { r2Key, nextVersion, storedName, originalName, fileSize } = body as {
    r2Key:         string
    nextVersion:   number
    storedName:    string
    originalName?: string
    fileSize?:     number
  }

  if (!r2Key || !nextVersion || !storedName) {
    return NextResponse.json(
      { error: 'Missing required fields: r2Key, nextVersion, storedName' },
      { status: 400 }
    )
  }

  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Create the FileVersion record + update MediaFile in a transaction
  const [version] = await prisma.$transaction([
    prisma.fileVersion.create({
      data: {
        mediaFileId:   params.fileId,
        versionNumber: nextVersion,
        r2Key,
        uploadedById:  session.user.id,
      },
    }),
    prisma.mediaFile.update({
      where: { id: params.fileId },
      data: {
        r2Key,
        storedName,
        ...(originalName ? { originalName } : {}),
        ...(fileSize     ? { fileSize: BigInt(fileSize) } : {}),
      },
    }),
  ])

  // Activity log — non-fatal
  await log('VERSION_UPLOADED', session.user.id, {
    mediaFileId: file.id,
    eventId:     file.eventId,
    metadata: {
      fileName:      originalName ?? file.originalName,
      versionNumber: nextVersion,
      r2Key,
    },
  })

  return NextResponse.json({ version: { ...version, createdAt: version.createdAt.toISOString() } })
}
