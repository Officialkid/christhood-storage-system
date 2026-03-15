import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activityLog'

// ── GET /api/hierarchy/events/[id] ─────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      category: { include: { year: true } },
      subfolders: {
        orderBy: { label: 'asc' },
        include: { _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } } },
      },
      _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
    },
  })

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ event })
}

// ── PATCH /api/hierarchy/events/[id] ─ rename / re-date ────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { name, date } = await req.json()

    const event = await prisma.event.update({
      where: { id: params.id },
      data: {
        ...(name ? { name }                : {}),
        ...(date ? { date: new Date(date) } : {}),
      },
      include: {
        category: { include: { year: true } },
        subfolders: { orderBy: { label: 'asc' } },
        _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
      },
    })

    await logActivity('EVENT_UPDATED', session.user.id, { name, date }, event.id)
    return NextResponse.json({ event })
  } catch (err) {
    return handleApiError(err, 'hierarchy/events PATCH')
  }
}

// ── DELETE /api/hierarchy/events/[id] ──────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { _count: { select: { mediaFiles: true } } },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (event._count.mediaFiles > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${event.name}" — it still has ${event._count.mediaFiles} media file(s). ` +
               `Delete or move the media first.`,
      },
      { status: 409 }
    )
  }

  await logActivity('EVENT_DELETED', session.user.id, { name: event.name }, params.id)
  await prisma.event.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
