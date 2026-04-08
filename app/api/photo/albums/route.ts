import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

// POST /api/photo/albums — create an album
export async function POST(req: NextRequest) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { collectionId, title, description, visibility, allowDownload } = await req.json() as {
    collectionId:  string
    title:         string
    description?:  string
    visibility?:   'PUBLIC' | 'PASSWORD' | 'PRIVATE'
    allowDownload?: boolean
  }

  if (!collectionId || !title?.trim()) {
    return NextResponse.json({ error: 'collectionId and title are required.' }, { status: 400 })
  }

  // Verify the collection belongs to the current user
  const collection = await prisma.photoCollection.findFirst({
    where: { id: collectionId, ownerId: session.userId },
    select: { id: true },
  })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  }

  const baseSlug = toSlug(title) || 'album'
  let slug    = baseSlug
  let attempt = 0
  while (attempt < 20) {
    const existing = await prisma.photoAlbum.findUnique({
      where: { collectionId_slug: { collectionId, slug } },
      select: { id: true },
    })
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const album = await prisma.photoAlbum.create({
    data: {
      slug,
      title:        title.trim().slice(0, 120),
      description:  description?.trim().slice(0, 500),
      collectionId,
      visibility:   visibility ?? 'PUBLIC',
      allowDownload: allowDownload ?? true,
    },
  })

  return NextResponse.json({ album }, { status: 201 })
}
