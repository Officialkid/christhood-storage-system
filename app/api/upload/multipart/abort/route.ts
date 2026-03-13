import { NextRequest, NextResponse }    from 'next/server'
import { getServerSession }            from 'next-auth'
import { authOptions }                 from '@/lib/auth'
import { abortMultipartUpload }        from '@/lib/r2'

/**
 * POST /api/upload/multipart/abort
 *
 * Cancels an in-progress multipart upload and instructs R2 to discard all
 * uploaded parts. Must be called when an upload fails or is cancelled to
 * prevent orphaned chunk data from incurring storage costs.
 *
 * R2 also expires incomplete multipart uploads automatically if you configure
 * an "Abort Incomplete Multipart Uploads" lifecycle rule on the bucket,
 * but explicit abort is faster and more reliable.
 *
 * Body:    { uploadId, key }
 * Returns: { success: true }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    uploadId?: string
    key?:      string
  }

  const { uploadId, key } = body

  if (!uploadId || !key) {
    return NextResponse.json({ error: 'Missing required fields: uploadId, key' }, { status: 400 })
  }

  try {
    await abortMultipartUpload(key, uploadId)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[multipart/abort]', err)
    // Even on error, return success — aborting a session that no longer
    // exists (e.g. already completed/expired) is not an error for the client.
    return NextResponse.json({ success: true })
  }
}
