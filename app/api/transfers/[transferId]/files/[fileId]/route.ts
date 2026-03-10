import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'

/**
 * GET /api/transfers/[transferId]/files/[fileId]
 *
 * Returns a short-lived presigned R2 download URL for a single file.
 * Only the assigned recipient or an ADMIN may access.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string; fileId: string }> }
) {
  const { transferId, fileId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify transfer ownership / admin access
  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { recipientId: true },
  })
  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  const isRecipient = transfer.recipientId === session.user.id
  const isAdmin     = session.user.role === 'ADMIN'
  if (!isRecipient && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const file = await prisma.transferFile.findFirst({
    where:  { id: fileId, transferId },
    select: { r2Key: true, originalName: true },
  })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const url = await getPresignedDownloadUrl(file.r2Key, 3600)
  return NextResponse.json({ url, filename: file.originalName })
}
