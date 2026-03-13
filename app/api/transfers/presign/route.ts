import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPresignedUploadUrl } from '@/lib/r2'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/transfers/presign
 * Admin-only. Returns a presigned R2 PUT URL for a single transfer file.
 *
 * Body: { transferId: string, filename: string, folderPath: string | null, contentType: string }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { transferId, filename, folderPath, contentType } = body

  if (!transferId || !filename || !contentType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Guard: transferId must be a valid UUID format to prevent path injection
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(transferId)) {
    return NextResponse.json({ error: 'Invalid transfer ID format' }, { status: 400 })
  }

  // Guard: filename must not contain path traversal sequences
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  // R2 key: transfers/{transferId}/{folderPath/}{filename}
  // Strip leading/trailing slashes then remove any '..' segments (matches respond/presign behaviour)
  const cleanPath = folderPath ? folderPath.replace(/^\/+|\/+$/g, '').replace(/\.\./g, '') : ''
  const pathSegment = cleanPath ? `${cleanPath}/` : ''
  const r2Key = `transfers/${transferId}/${pathSegment}${filename}`

  try {
    // Long expiry because large files may take time
    const presignedUrl = await getPresignedUploadUrl(r2Key, contentType, 3600)
    return NextResponse.json({ presignedUrl, r2Key })
  } catch (err: any) {
    console.error('[transfers/presign]', err)
    return NextResponse.json(
      { error: 'Could not generate upload URL. Please try again.' },
      { status: 500 },
    )
  }
}
