/**
 * GET /api/public-share/[token]/download
 *
 * Returns a short-lived presigned R2 GET URL for the uploaded file.
 * Requires PIN if one was set (pass ?pin=<value> in the query string).
 * Increments download count (fire-and-forget).
 *
 * Responses:
 *  200  — { downloadUrl }
 *  401  — PIN required
 *  403  — PIN wrong
 *  404  — not found / expired / not ready
 */

import { NextRequest, NextResponse } from 'next/server'
import { compare }                   from 'bcryptjs'
import { prisma }                    from '@/lib/prisma'
import { getPresignedDownloadUrl }   from '@/lib/r2'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params

  const record = await prisma.publicShareUpload.findUnique({
    where: { token },
    select: {
      id:           true,
      r2Key:        true,
      originalName: true,
      pinHash:      true,
      expiresAt:    true,
      isReady:      true,
    },
  })

  if (!record || !record.isReady || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Share link not found or has expired.' }, { status: 404 })
  }

  // ── PIN gate ──────────────────────────────────────────────────────────────
  if (record.pinHash) {
    const pin = req.nextUrl.searchParams.get('pin') ?? ''
    if (!pin) {
      return NextResponse.json({ error: 'PIN required.', pinRequired: true }, { status: 401 })
    }
    const ok = await compare(pin, record.pinHash)
    if (!ok) {
      return NextResponse.json({ error: 'Incorrect PIN.', pinRequired: true }, { status: 403 })
    }
  }

  // ── Increment download count (fire-and-forget) ────────────────────────────
  prisma.publicShareUpload.update({
    where: { id: record.id },
    data:  { downloadCount: { increment: 1 } },
  }).catch(() => { /* non-critical */ })

  // ── Generate presigned download URL (valid 5 minutes) ─────────────────────
  const downloadUrl = await getPresignedDownloadUrl(
    record.r2Key,
    300,
    record.originalName,
  )

  return NextResponse.json({ downloadUrl })
}
