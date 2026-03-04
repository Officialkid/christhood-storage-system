import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/tags
 * Returns all tags, sorted alphabetically.
 * Access: any authenticated user.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json({ tags })
}

/**
 * POST /api/tags
 * Body: { name: string }
 * Creates a new tag. ADMIN only.
 * Returns the created tag (or the existing one if name is already taken — idempotent).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: only ADMINs can create tags' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()

  if (!name) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  if (name.length > 50) return NextResponse.json({ error: 'Tag name too long (max 50 chars)' }, { status: 400 })

  // upsert so hitting the endpoint twice doesn't error
  const tag = await prisma.tag.upsert({
    where:  { name },
    update: {},
    create: { name },
  })

  return NextResponse.json({ tag }, { status: 201 })
}
