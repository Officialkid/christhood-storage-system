import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { getPresignedPartUrl }       from '@/lib/r2'

/**
 * POST /api/upload/multipart/presign
 *
 * Step 2 of the parallel multipart upload protocol.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  KEY PERFORMANCE WIN: returns presigned URLs for ALL requested    │
 * │  parts in a single server round-trip.                             │
 * │                                                                    │
 * │  Old approach: 1 API call per chunk  → N serial round-trips        │
 * │  New approach: 1 API call total      → all URLs returned at once  │
 * │                                                                    │
 * │  The client receives presignedUrls[] and uploads every chunk     │
 * │  concurrently (PARALLEL_LIMIT at a time) without any further     │
 * │  server interaction until the final /complete call.              │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Body:    { uploadId, key, partNumbers: number[] }
 * Returns: { presignedUrls: { partNumber: number, url: string }[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    uploadId?:    string
    key?:         string
    partNumbers?: number[]
  }

  const { uploadId, key, partNumbers } = body

  if (!uploadId || !key || !Array.isArray(partNumbers) || partNumbers.length === 0) {
    return NextResponse.json(
      { error: 'Missing required fields: uploadId, key, partNumbers (non-empty array)' },
      { status: 400 },
    )
  }

  // R2 / S3 multipart allows a maximum of 10,000 parts
  if (partNumbers.length > 10_000) {
    return NextResponse.json({ error: 'partNumbers may not exceed 10,000 entries' }, { status: 400 })
  }

  // Validate part numbers are positive integers
  if (partNumbers.some(n => !Number.isInteger(n) || n < 1 || n > 10_000)) {
    return NextResponse.json({ error: 'Each partNumber must be an integer between 1 and 10,000' }, { status: 400 })
  }

  try {
    // Generate all presigned URLs in parallel on the server — much faster than
    // sequential and the client gets everything it needs in one response.
    const presignedUrls = await Promise.all(
      partNumbers.map(async partNumber => ({
        partNumber,
        url: await getPresignedPartUrl(key, uploadId, partNumber, 3600),
      })),
    )

    return NextResponse.json({ presignedUrls })
  } catch (err: any) {
    console.error('[multipart/presign]', err)
    return NextResponse.json({ error: 'Failed to generate presigned URLs' }, { status: 500 })
  }
}
