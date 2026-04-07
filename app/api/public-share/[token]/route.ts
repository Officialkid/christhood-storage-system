/**
 * GET /api/public-share/[token]
 *
 * Returns public metadata for a share link (filename, size, title, message,
 * expiry, download count). Requires PIN if one was set.
 *
 * Query param: ?pin=<value>  (optional; only needed when record has a pinHash)
 *
 * Responses:
 *  200  — metadata JSON
 *  401  — PIN required (pinRequired: true in body)
 *  403  — PIN wrong
 *  404  — not found / expired / not yet ready
 */

import { NextRequest, NextResponse } from 'next/server'
import { compare }                   from 'bcryptjs'
import { prisma }                    from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const record = await prisma.publicShareUpload.findUnique({
    where: { token },
    select: {
      id:            true,
      originalName:  true,
      fileSize:      true,
      mimeType:      true,
      title:         true,
      message:       true,
      pinHash:       true,
      expiresAt:     true,
      downloadCount: true,
      isReady:       true,
      createdAt:     true,
    },
  })

  // Treat not-found, expired, and not-ready all as 404 to avoid enumeration
  if (!record || !record.isReady || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Share link not found or has expired.' }, { status: 404 })
  }

  // ── PIN gate ─────────────────────────────────────────────────────────────
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

  return NextResponse.json({
    originalName:  record.originalName,
    fileSize:      record.fileSize.toString(),   // BigInt → string for JSON
    mimeType:      record.mimeType,
    title:         record.title,
    message:       record.message,
    expiresAt:     record.expiresAt,
    downloadCount: record.downloadCount,
    createdAt:     record.createdAt,
    pinRequired:   Boolean(record.pinHash),
  })
}
