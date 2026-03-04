import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

/**
 * GET /api/events/[eventId]/tags
 * Returns current tags for an event.
 * Access: any authenticated user.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.event.findUnique({
    where:   { id: params.eventId },
    include: { tags: { orderBy: { name: 'asc' } } },
  })
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  return NextResponse.json({ tags: event.tags })
}

/**
 * PUT /api/events/[eventId]/tags
 * Body: { tagIds: string[] }
 *
 * Replaces the complete set of tags on an event.
 * Access: EDITOR and ADMIN only.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string
  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Forbidden: UPLOADERs cannot edit tags' }, { status: 403 })
  }

  const body   = await req.json().catch(() => ({}))
  const tagIds = (body.tagIds as string[] | undefined) ?? []

  if (!Array.isArray(tagIds)) {
    return NextResponse.json({ error: 'tagIds must be an array' }, { status: 400 })
  }

  const event = await prisma.event.findUnique({ where: { id: params.eventId } })
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (tagIds.length > 0) {
    const found = await prisma.tag.count({ where: { id: { in: tagIds } } })
    if (found !== tagIds.length) {
      return NextResponse.json({ error: 'One or more tag IDs are invalid' }, { status: 400 })
    }
  }

  const updated = await prisma.event.update({
    where: { id: params.eventId },
    data: {
      tags: {
        set: tagIds.map((id) => ({ id })),
      },
    },
    include: { tags: { orderBy: { name: 'asc' } } },
  })

  await log('TAG_CHANGED', session.user.id, {
    eventId: event.id,
    metadata: {
      target:   'event',
      eventName: event.name,
      tagIds,
      tagNames: updated.tags.map((t) => t.name),
    },
  })

  return NextResponse.json({ tags: updated.tags })
}
