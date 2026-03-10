import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPresignedUploadUrl } from '@/lib/r2'

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

  // R2 key: transfers/{transferId}/{folderPath/}{filename}
  const pathSegment = folderPath ? `${folderPath}/` : ''
  const r2Key = `transfers/${transferId}/${pathSegment}${filename}`

  // Long expiry because large files may take time
  const presignedUrl = await getPresignedUploadUrl(r2Key, contentType, 3600)

  return NextResponse.json({ presignedUrl, r2Key })
}
