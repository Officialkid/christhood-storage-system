import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedUploadUrl }      from '@/lib/r2'

/**
 * POST /api/transfers/[transferId]/respond/presign
 *
 * Returns a short-lived presigned PUT URL so the recipient can upload a
 * single response file directly to R2.
 *
 * Access: recipient only.
 * Transfer must not be EXPIRED or COMPLETED.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
  const { transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { recipientId: true, status: true },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  if (transfer.recipientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (transfer.status === 'EXPIRED' || transfer.status === 'COMPLETED') {
    return NextResponse.json({ error: 'This transfer is closed' }, { status: 400 })
  }

  const { filename, folderPath, contentType } = await req.json() as {
    filename:    string
    folderPath:  string | null
    contentType: string
  }

  if (!filename?.trim()) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  }

  // Build the R2 key inside the transfer's response sub-prefix
  const cleanFolder = folderPath?.replace(/^\/|\/$/g, '') ?? ''
  const key = cleanFolder
    ? `transfers/${transferId}/response/${cleanFolder}/${filename}`
    : `transfers/${transferId}/response/${filename}`

  // 1-hour expiry — response files may be large
  const presignedUrl = await getPresignedUploadUrl(key, contentType || 'application/octet-stream', 3600)
  return NextResponse.json({ presignedUrl, r2Key: key })
}
