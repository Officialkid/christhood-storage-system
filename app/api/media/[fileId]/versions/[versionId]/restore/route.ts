import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

/**
 * POST /api/media/[fileId]/versions/[versionId]/restore
 *
 * Restores a previous version of a file by:
 *  1. Creating a NEW FileVersion record that copies the target version's r2Key
 *     (so history is never destroyed — restore is always a forward operation).
 *  2. Updating MediaFile.r2Key → the restored version's key.
 *  3. Logging VERSION_RESTORED.
 *
 * Access: EDITOR and ADMIN only.
 */
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ fileId: string; versionId: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string
  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Forbidden: UPLOADERs cannot restore versions' }, { status: 403 })
  }

  // Load the target version
  const targetVersion = await prisma.fileVersion.findUnique({
    where: { id: params.versionId },
  })
  if (!targetVersion || targetVersion.mediaFileId !== params.fileId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Check not already the active version
  if (file.r2Key === targetVersion.r2Key) {
    return NextResponse.json({ error: 'That version is already the active version' }, { status: 400 })
  }

  // Determine the next version number
  const latestVersion = await prisma.fileVersion.findFirst({
    where:   { mediaFileId: params.fileId },
    orderBy: { versionNumber: 'desc' },
    select:  { versionNumber: true },
  })
  const newVersionNumber = (latestVersion?.versionNumber ?? 1) + 1

  // Create restore version + update MediaFile in a transaction
  const [restoredVersion] = await prisma.$transaction([
    prisma.fileVersion.create({
      data: {
        mediaFileId:   params.fileId,
        versionNumber: newVersionNumber,
        r2Key:         targetVersion.r2Key,
        uploadedById:  session.user.id,
      },
    }),
    prisma.mediaFile.update({
      where: { id: params.fileId },
      data:  { r2Key: targetVersion.r2Key },
    }),
  ])

  // Activity log — non-fatal
  await log('VERSION_RESTORED', session.user.id, {
    mediaFileId: file.id,
    eventId:     file.eventId,
    metadata: {
      fileName:         file.originalName,
      fromVersion:      targetVersion.versionNumber,
      newVersionNumber,
    },
  })

  return NextResponse.json({
    version: { ...restoredVersion, createdAt: restoredVersion.createdAt.toISOString() },
  })
}
