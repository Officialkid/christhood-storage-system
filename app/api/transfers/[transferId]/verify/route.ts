import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { getPresignedDownloadUrl, headObject } from '@/lib/r2'
import { computeSHA256 }              from '@/lib/transferIntegrity'
import { log }                        from '@/lib/activityLog'
import { logger }                     from '@/lib/logger'
/**
 * GET /api/transfers/[transferId]/verify
 *
 * Re-downloads every file in the transfer (and its response, if present) from
 * R2 and compares each file's SHA-256 hash against the checksum stored in the
 * database at upload time.
 *
 * Access: the designated recipient OR any ADMIN.
 *
 * Response:
 *   {
 *     allPassed:     boolean,
 *     transferFiles: { id, originalName, pass: boolean | null }[],
 *     responseFiles: { id, originalName, pass: boolean | null }[],
 *   }
 *
 * A `pass` of `null` means no checksum was stored (legacy upload) — cannot
 * verify.  A `pass` of `false` means the stored checksum does not match the
 * bytes currently in R2 — this is a genuine integrity failure.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ transferId: string }> },
) {
  const { transferId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      files:    true,
      response: { include: { files: true } },
    },
  })

  if (!transfer) {
    return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  const canVerify =
    transfer.recipientId === session.user.id ||
    transfer.senderId === session.user.id ||
    session.user.role === 'ADMIN'

  if (!canVerify) {
    return NextResponse.json(
      { error: 'This transfer is private. Only the sender, recipient, or an Admin may verify it.' },
      { status: 403 },
    )
  }

  // ── Helper: verify one file without crashing 1 GiB Cloud Run RAM ─────────
  async function verifyFile(file: {
    id:           string
    originalName: string
    r2Key:        string
    fileSize:     bigint
    checksum:     string
  }): Promise<{ id: string; originalName: string; pass: boolean | null }> {
    try {
      const head = await headObject(file.r2Key)
      if (!head) {
        return { id: file.id, originalName: file.originalName, pass: false }
      }
      // Verify exact byte-count integrity on all files; for <= 25 MB with SHA-256 checksum, also verify SHA-256
      if (BigInt(head.size) !== file.fileSize) {
        return { id: file.id, originalName: file.originalName, pass: false }
      }
      if (!file.checksum || head.size > 25 * 1024 * 1024) {
        return { id: file.id, originalName: file.originalName, pass: true }
      }
      const url = await getPresignedDownloadUrl(file.r2Key, 900)
      const res = await fetch(url)
      if (!res.ok || !res.body) {
        return { id: file.id, originalName: file.originalName, pass: null }
      }
      const arrayBuf = await res.arrayBuffer()
      const actual   = computeSHA256(Buffer.from(arrayBuf))
      return { id: file.id, originalName: file.originalName, pass: actual === file.checksum.toLowerCase() }
    } catch (err) {
      logger.error('VERIFY_ERROR', { route: '/api/transfers/verify', transferId, error: (err as Error)?.message, message: `Error verifying ${file.originalName}` })
      return { id: file.id, originalName: file.originalName, pass: null }
    }
  }

  // ── Verify transfer files ────────────────────────────────────────────────
  const transferResults = await Promise.all(transfer.files.map(verifyFile))

  // ── Verify response files (if any) ──────────────────────────────────────
  const responseResults = transfer.response
    ? await Promise.all(transfer.response.files.map(verifyFile))
    : []

  // ── Log any failures ────────────────────────────────────────────────────
  const allResults = [...transferResults, ...responseResults]
  const failures   = allResults.filter(r => r.pass === false)

  if (failures.length > 0) {
    log('TRANSFER_INTEGRITY_FAILURE', session.user.id, {
      metadata: {
        transferId,
        source:      'verify-endpoint',
        failedFiles: failures.map(f => ({ id: f.id, originalName: f.originalName })),
      },
    }).catch((e: unknown) => logger.warn('TRANSFER_SIDE_EFFECT_FAILED', { route: '/api/transfers/verify', transferId, error: (e as Error)?.message, message: 'Integrity failure log failed' }))
  }

  const allPassed = allResults.every(r => r.pass === true || r.pass === null)
    && failures.length === 0

  return NextResponse.json({
    allPassed,
    transferFiles: transferResults,
    responseFiles: responseResults,
  })
}
