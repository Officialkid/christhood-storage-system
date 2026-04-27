import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/public-share/batch?tokens=tok1,tok2,...
 * Returns metadata for up to 100 share tokens in one round-trip.
 * Used by the batch download page to render all files in a transfer.
 */
export async function GET(req: NextRequest) {
  const raw    = req.nextUrl.searchParams.get('tokens') ?? ''
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 100)

  if (tokens.length === 0) {
    return NextResponse.json({ error: 'tokens query param is required.' }, { status: 400 })
  }

  const records = await prisma.publicShareUpload.findMany({
    where: {
      token:     { in: tokens },
      isReady:   true,
      expiresAt: { gt: new Date() },
    },
    select: {
      token:         true,
      originalName:  true,
      fileSize:      true,
      mimeType:      true,
      title:         true,
      message:       true,
      expiresAt:     true,
      downloadCount: true,
      pinHash:       true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(
    records.map(r => ({
      token:         r.token,
      originalName:  r.originalName,
      fileSize:      r.fileSize.toString(),
      mimeType:      r.mimeType,
      title:         r.title,
      message:       r.message,
      expiresAt:     r.expiresAt.toISOString(),
      downloadCount: r.downloadCount,
      pinRequired:   !!r.pinHash,
    }))
  )
}
