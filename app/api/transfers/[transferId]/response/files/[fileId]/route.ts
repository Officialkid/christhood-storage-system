import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl }    from '@/lib/r2'

/**
 * GET /api/transfers/[transferId]/response/files/[fileId]
 *
 * Returns a short-lived presigned R2 download URL for a single response file.
 * Admin only.
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
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  // Verify the transfer exists
  const transfer = await prisma.transfer.findUnique({
    where:  { id: transferId },
    select: { id: true, response: { select: { id: true } } },
  })
  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }
  if (!transfer.response) {
    return NextResponse.json({ error: 'No response for this transfer' }, { status: 404 })
  }

  const file = await prisma.transferResponseFile.findFirst({
    where:  { id: fileId, responseId: transfer.response.id },
    select: { r2Key: true, originalName: true },
  })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const url = await getPresignedDownloadUrl(file.r2Key, 3600)
  return NextResponse.json({ url, filename: file.originalName })
}
