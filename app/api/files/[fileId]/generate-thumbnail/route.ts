import { NextRequest, NextResponse }      from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getToken }                        from 'next-auth/jwt'
import { prisma }                          from '@/lib/prisma'
import { generateAndStoreThumbnail }       from '@/lib/thumbnail'

// POST /api/files/[fileId]/generate-thumbnail
// Re-triggers (or initially triggers) server-side thumbnail generation for a
// file.  Useful when the original fire-and-forget from /api/upload/register
// failed, or when called from the dashboard for a file that has no thumbnail.
//
// Permissions: uploaders may only trigger for their own files; editors and
// admins may trigger for any file.

export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fileId } = params
  const role = (token.role as string) ?? 'UPLOADER'

  const file = await prisma.mediaFile.findUnique({
    where:  { id: fileId },
    select: { id: true, r2Key: true, fileType: true, storedName: true, originalName: true, uploaderId: true },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (role === 'UPLOADER' && file.uploaderId !== token.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Derive MIME type from file extension for the thumbnail generator
  const ext         = file.originalName.split('.').pop()?.toLowerCase() ?? ''
  const mimeByExt: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', m4v: 'video/mp4',
  }
  const contentType = mimeByExt[ext] ?? (file.fileType === 'VIDEO' ? 'video/mp4' : 'image/jpeg')

  // Run thumbnail generation (may take a few seconds for videos)
  try {
    await generateAndStoreThumbnail(
      file.id,
      file.r2Key,
      file.fileType as 'PHOTO' | 'VIDEO',
      contentType,
      file.originalName,
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return handleApiError(err, 'generate-thumbnail')
  }
}
