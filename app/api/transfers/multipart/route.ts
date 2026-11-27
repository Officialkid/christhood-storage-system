import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  createMultipartUpload,
  getPresignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
} from '@/lib/r2'
import { handleApiError } from '@/lib/apiError'

const UUID_OR_CUID_RE = /^[a-z0-9-]{8,64}$/i

/**
 * POST /api/transfers/multipart
 * Unified chunked multipart upload endpoint for Transfer files and Transfer responses.
 * Supports multi-GB 4K video transfers with parallel chunks, live progress, and zero RAM buffering.
 *
 * Actions:
 *  - { action: 'create', transferId, filename, folderPath?, contentType, isResponse? }
 *  - { action: 'presign-parts', r2Key, uploadId, partNumbers: number[] }
 *  - { action: 'complete', r2Key, uploadId, parts: { PartNumber: number, ETag: string }[] }
 *  - { action: 'abort', r2Key, uploadId }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { transferId, filename, folderPath, contentType, isResponse } = body
      if (!transferId || !filename || !contentType) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      if (!UUID_OR_CUID_RE.test(String(transferId))) {
        return NextResponse.json({ error: 'Invalid transferId' }, { status: 400 })
      }
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
      }
      const cleanPath = folderPath ? String(folderPath).replace(/^\/+|\/+$/g, '').replace(/\.\./g, '') : ''
      const pathSegment = cleanPath ? `${cleanPath}/` : ''
      const basePrefix = isResponse ? `transfers/${transferId}/response/` : `transfers/${transferId}/`
      const r2Key = `${basePrefix}${pathSegment}${filename}`

      const uploadId = await createMultipartUpload(r2Key, contentType)
      return NextResponse.json({ uploadId, r2Key })
    }

    if (action === 'presign-parts') {
      const { r2Key, uploadId, partNumbers } = body
      if (!r2Key || !String(r2Key).startsWith('transfers/') || !uploadId || !Array.isArray(partNumbers)) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
      }
      const urls: Record<number, string> = {}
      await Promise.all(
        (partNumbers as number[]).slice(0, 50).map(async (partNum) => {
          urls[partNum] = await getPresignedPartUrl(r2Key, uploadId, partNum, 3600)
        }),
      )
      return NextResponse.json({ urls })
    }

    if (action === 'complete') {
      const { r2Key, uploadId, parts } = body
      if (!r2Key || !String(r2Key).startsWith('transfers/') || !uploadId || !Array.isArray(parts)) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
      }
      const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber)
      await completeMultipartUpload(r2Key, uploadId, sortedParts)
      return NextResponse.json({ ok: true, r2Key })
    }

    if (action === 'abort') {
      const { r2Key, uploadId } = body
      if (r2Key && String(r2Key).startsWith('transfers/') && uploadId) {
        await abortMultipartUpload(r2Key, uploadId).catch(() => {})
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return handleApiError(err, 'transfers/multipart')
  }
}
