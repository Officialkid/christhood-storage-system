/**
 * POST /api/public-share/[token]/confirm
 *
 * Called by the client immediately after a successful direct R2 upload.
 * Sets isReady = true so the share link becomes publicly visible.
 *
 * No auth required — the token itself is the proof of creation.
 * Records that remain isReady = false after 2 hours are purged by the cron job.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const record = await prisma.publicShareUpload.findUnique({
    where: { token },
    select: { id: true, isReady: true, expiresAt: true },
  })

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Share record not found or expired.' }, { status: 404 })
  }

  if (record.isReady) {
    // Already confirmed — idempotent, return 200
    return NextResponse.json({ ok: true })
  }

  await prisma.publicShareUpload.update({
    where: { id: record.id },
    data:  { isReady: true },
  })

  return NextResponse.json({ ok: true })
}
