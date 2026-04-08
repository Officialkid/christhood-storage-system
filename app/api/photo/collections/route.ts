import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession } from '@/lib/photo-gallery/session'

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

// GET /api/photo/collections — list my collections
export async function GET(req: NextRequest) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const collections = await prisma.photoCollection.findMany({
    where:   { ownerId: session.userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count:  { select: { albums: true } },
      albums: {
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { coverKey: true, photoCount: true },
      },
    },
  })

  return NextResponse.json({ collections })
}

// POST /api/photo/collections — create a collection
export async function POST(req: NextRequest) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description } = await req.json() as { title: string; description?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }

  const baseSlug = toSlug(title) || 'collection'

  // Ensure slug unique for this owner
  let slug    = baseSlug
  let attempt = 0
  while (attempt < 20) {
    const existing = await prisma.photoCollection.findUnique({
      where: { ownerId_slug: { ownerId: session.userId, slug } },
      select: { id: true },
    })
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const collection = await prisma.photoCollection.create({
    data: {
      slug,
      title:       title.trim().slice(0, 120),
      description: description?.trim().slice(0, 500),
      ownerId:     session.userId,
    },
  })

  return NextResponse.json({ collection }, { status: 201 })
}
