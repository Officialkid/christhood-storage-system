/**
 * GET  /api/photo/s/[token]               — fetch public album via share token
 * POST /api/photo/s/[token]               — verify share token password
 *                                            body: { password: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

type Params = { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params

  const shareToken = await prisma.photoShareToken.findUnique({
    where: { token },
    include: {
      album: {
        include: {
          items: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          collection: {
            include: {
              owner: { select: { username: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  if (!shareToken) {
    return NextResponse.json({ error: 'Share link not found or has been removed.' }, { status: 404 })
  }

  // Expired?
  if (shareToken.expiresAt && shareToken.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 })
  }

  const { album } = shareToken

  // Password-protected — check if client has already verified (via cookie)
  if (shareToken.passwordHash) {
    const verified = req.cookies.get(`gp-share-${token}`)?.value
    if (verified !== 'ok') {
      // Signal to client that a password is required
      return NextResponse.json(
        { requiresPassword: true, albumTitle: album.title },
        { status: 200 },
      )
    }
  }

  // Increment view count (fire and forget)
  prisma.photoShareToken.update({
    where: { token },
    data:  { viewCount: { increment: 1 } },
  }).catch(() => {})

  const allowDownload = shareToken.allowDownload && album.allowDownload

  return NextResponse.json({
    album: {
      id:          album.id,
      title:       album.title,
      description: album.description,
      coverUrl:    album.coverKey ? getGalleryPublicUrl(album.coverKey) : null,
      photoCount:  album.photoCount,
      allowDownload,
      collection: {
        title:  album.collection.title,
        slug:   album.collection.slug,
        owner:  album.collection.owner,
      },
      items: album.items.map(item => ({
        id:           item.id,
        caption:      item.caption,
        width:        item.width,
        height:       item.height,
        thumbnailUrl: getGalleryPublicUrl(item.thumbnailKey),
        previewUrl:   getGalleryPublicUrl(item.previewKey),
        originalUrl:  allowDownload ? getGalleryPublicUrl(item.originalKey) : null,
        sortOrder:    item.sortOrder,
      })),
    },
    token: {
      label:         shareToken.label,
      allowDownload: shareToken.allowDownload,
      expiresAt:     shareToken.expiresAt,
    },
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params

  const shareToken = await prisma.photoShareToken.findUnique({
    where:  { token },
    select: { passwordHash: true, expiresAt: true, token: true },
  })

  if (!shareToken) {
    return NextResponse.json({ error: 'Share link not found.' }, { status: 404 })
  }

  if (shareToken.expiresAt && shareToken.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 })
  }

  if (!shareToken.passwordHash) {
    // No password required — set cookie and return ok
    const res = NextResponse.json({ ok: true })
    res.cookies.set(`gp-share-${token}`, 'ok', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   86400, // 24 hours
      path:     '/',
    })
    return res
  }

  const { password } = await req.json() as { password: string }
  if (!password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 })
  }

  const valid = await bcrypt.compare(password, shareToken.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(`gp-share-${token}`, 'ok', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   86400,
    path:     '/',
  })
  return res
}
