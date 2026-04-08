import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

type Params = { params: Promise<{ id: string }> }

// GET /api/photo/collections/[id]
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const collection = await prisma.photoCollection.findFirst({
    where:   { id, ownerId: session.userId },
    include: {
      albums: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id:          true,
          slug:        true,
          title:       true,
          description: true,
          coverKey:    true,
          visibility:  true,
          allowDownload: true,
          photoCount:  true,
          viewCount:   true,
          createdAt:   true,
          _count:      { select: { shareTokens: true } },
        },
      },
    },
  })

  if (!collection) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Hydrate cover URLs
  const hydrated = {
    ...collection,
    coverUrl: collection.coverKey ? getGalleryPublicUrl(collection.coverKey) : null,
    albums: collection.albums.map(a => ({
      ...a,
      coverUrl: a.coverKey ? getGalleryPublicUrl(a.coverKey) : null,
    })),
  }

  return NextResponse.json({ collection: hydrated })
}

// PUT /api/photo/collections/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { title, description, isVisible } = await req.json() as {
    title?: string; description?: string; isVisible?: boolean
  }

  const existing = await prisma.photoCollection.findFirst({
    where: { id, ownerId: session.userId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const updated = await prisma.photoCollection.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title: title.trim().slice(0, 120) }),
      ...(description !== undefined && { description: description.trim().slice(0, 500) }),
      ...(isVisible   !== undefined && { isVisible }),
    },
  })

  return NextResponse.json({ collection: updated })
}

// DELETE /api/photo/collections/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await prisma.photoCollection.findFirst({
    where: { id, ownerId: session.userId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // Cascade deletes albums, items, share tokens (via Prisma onDelete: Cascade)
  await prisma.photoCollection.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
