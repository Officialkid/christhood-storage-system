import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  req:     NextRequest,
  { params }: { params: { galleryId: string } },
) {
  const { galleryId } = params

  let deviceType: string = 'DESKTOP'
  try {
    const body = await req.json()
    const raw = (body?.deviceType ?? '').toString().toUpperCase()
    if (['MOBILE', 'TABLET', 'DESKTOP'].includes(raw)) deviceType = raw
  } catch { /* ignore parse errors */ }

  const country = req.headers.get('cf-ipcountry') ?? null

  // Fire-and-forget — don't block the response on DB writes
  prisma.galleryView
    .create({ data: { galleryId, deviceType, country } })
    .then(() =>
      prisma.publicGallery.updateMany({
        where: { id: galleryId },
        data:  { viewCount: { increment: 1 } },
      }),
    )
    .catch(() => {})

  return NextResponse.json({ ok: true })
}
