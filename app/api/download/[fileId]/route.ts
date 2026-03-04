import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { getPresignedDownloadUrl }   from '@/lib/r2'
import { canDownloadFile }           from '@/lib/downloadAuth'
import { log }                       from '@/lib/activityLog'

const URL_EXPIRY_SECONDS = 15 * 60  // 15 minutes

/**
 * GET /api/download/[fileId]
 *
 * Returns a 15-minute presigned R2 download URL for the requested file.
 * Enforces role-based access and logs every successful download.
 */
export async function GET(
  req:     NextRequest,
  { params }: { params: { fileId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileId } = params
  const result = await canDownloadFile(session.user.id, session.user.role, fileId)

  if (!result.allowed) {
    return NextResponse.json({ error: result.reason }, { status: 403 })
  }

  const { file } = result

  // Generate a fresh short-lived URL
  const url = await getPresignedDownloadUrl(file.r2Key, URL_EXPIRY_SECONDS)

  // Log the download — fire-and-forget, never block the response
  log('FILE_DOWNLOADED', session.user.id, {
    mediaFileId: file.id,
    eventId:     file.eventId,
    metadata: {
      fileName:     file.originalName,
      storedName:   file.storedName,
    },
  }).catch((e: unknown) => console.warn('[download log]', e))

  return NextResponse.json({ url, expiresIn: URL_EXPIRY_SECONDS })
}
