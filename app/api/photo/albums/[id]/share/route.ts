/**
 * GET  /api/photo/albums/[id]/share   — list share tokens
 * POST /api/photo/albums/[id]/share   — create share token
 * DELETE /api/photo/albums/[id]/share?tokenId= — revoke a share token
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: albumId } = await params

  const album = await prisma.photoAlbum.findFirst({
    where: { id: albumId, collection: { ownerId: session.userId } },
    select: { id: true },
  })
  if (!album) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const tokens = await prisma.photoShareToken.findMany({
    where:   { albumId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      token:         true,
      label:         true,
      allowDownload: true,
      expiresAt:     true,
      viewCount:     true,
      createdAt:     true,
      // Note: passwordHash intentionally omitted from response
    },
  })

  return NextResponse.json({ tokens })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: albumId } = await params

  const album = await prisma.photoAlbum.findFirst({
    where: { id: albumId, collection: { ownerId: session.userId } },
    select: { id: true },
  })
  if (!album) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { label, allowDownload, password, expiresInDays } = await req.json() as {
    label?:         string
    allowDownload?: boolean
    password?:      string
    expiresInDays?: number
  }

  let passwordHash: string | null = null
  if (password?.trim()) {
    passwordHash = await bcrypt.hash(password, 10)
  }

  let expiresAt: Date | null = null
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 86400_000)
  }

  const shareToken = await prisma.photoShareToken.create({
    data: {
      albumId,
      label:         label?.trim().slice(0, 80) || null,
      allowDownload: allowDownload ?? true,
      passwordHash,
      expiresAt,
    },
    select: {
      id:            true,
      token:         true,
      label:         true,
      allowDownload: true,
      expiresAt:     true,
      viewCount:     true,
      createdAt:     true,
    },
  })

  return NextResponse.json({ shareToken }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: albumId } = await params
  const tokenId = req.nextUrl.searchParams.get('tokenId')
  if (!tokenId) return NextResponse.json({ error: 'tokenId is required.' }, { status: 400 })

  const shareToken = await prisma.photoShareToken.findFirst({
    where: { id: tokenId, albumId, album: { collection: { ownerId: session.userId } } },
    select: { id: true },
  })
  if (!shareToken) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  await prisma.photoShareToken.delete({ where: { id: tokenId } })

  return NextResponse.json({ ok: true })
}
