/**
 * POST /api/gallery/create
 * Creates a new gallery draft.
 * Allowed: EDITOR, ADMIN
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { logger }                    from '@/lib/logger'
import { withLogging }               from '@/lib/api-handler'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const existing = await prisma.publicGallery.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  })
  if (!existing.length) return base
  const taken = new Set(existing.map(g => g.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

async function handler(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { role, id: userId } = session.user
  if (role !== 'EDITOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, categoryName, year, slug: rawSlug } = body

  if (!title || !year) {
    return NextResponse.json({ error: 'title and year are required' }, { status: 400 })
  }

  const baseSlug = rawSlug ? slugify(rawSlug) : slugify(title)
  const slug     = await ensureUniqueSlug(baseSlug)

  const gallery = await prisma.publicGallery.create({
    data: {
      slug,
      title,
      description:  description ?? null,
      categoryName: categoryName ?? null,
      year:         Number(year),
      status:       'DRAFT',
      createdById:  userId,
    },
  })

  logger.info('GALLERY_CREATED', {
    userId,
    userRole: role,
    route:    '/api/gallery/create',
    message:  `Gallery draft "${gallery.title}" created`,
    metadata: { galleryId: gallery.id, slug: gallery.slug, title: gallery.title },
  })

  return NextResponse.json({ gallery })
}

export const POST = withLogging('/api/gallery/create', handler)
