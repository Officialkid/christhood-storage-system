import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Predefined tags seeded on first run. */
const PREDEFINED_TAGS = [
  'Youth',
  'Worship',
  'Outreach',
  'Testimony',
  'Missions',
  'Conference',
  'Leadership',
  'Prayer',
]

/**
 * POST /api/admin/tags/seed
 * Creates all predefined tags if they don't already exist.
 * ADMIN only.
 */
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // createMany with skipDuplicates is the most efficient approach
  const result = await prisma.tag.createMany({
    data:           PREDEFINED_TAGS.map((name) => ({ name })),
    skipDuplicates: true,
  })

  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json({ seeded: result.count, tags })
}
