import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activityLog'
import { logger }      from '@/lib/logger'

/**
 * POST /api/hierarchy/subfolders
 * Body: { label, eventId }
 * ADMIN only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { label, labels, eventId } = body

    const rawLabels: string[] = Array.isArray(labels)
      ? labels.map((l: unknown) => (typeof l === 'string' ? l.trim() : '')).filter(Boolean)
      : typeof label === 'string' && label.trim()
        ? [label.trim()]
        : []

    if (rawLabels.length === 0 || !eventId) {
      return NextResponse.json(
        { error: 'Folder name and eventId are required.' },
        { status: 400 }
      )
    }

    // Check event exists + existing subfolders for duplicate prevention
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { subfolders: true },
    })
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

    const existingLower = new Set(event.subfolders.map(s => s.label.trim().toLowerCase()))
    const toCreate: string[] = []
    for (const item of rawLabels) {
      const key = item.toLowerCase()
      if (existingLower.has(key)) continue
      existingLower.add(key)
      toCreate.push(item)
    }

    if (toCreate.length === 0) {
      return NextResponse.json(
        { error: `Folder "${rawLabels[0]}" already exists in this event.` },
        { status: 409 }
      )
    }

    const created = await Promise.all(
      toCreate.map(item =>
        prisma.eventSubfolder.create({
          data: { label: item, eventId },
          include: { _count: { select: { mediaFiles: true } } },
        })
      )
    )

    await logActivity('SUBFOLDER_CREATED', session.user.id, { labels: toCreate }, eventId)
    return NextResponse.json(
      { subfolder: created[0], subfolders: created },
      { status: 201 }
    )
  } catch (err) {
    logger.error('SUBFOLDER_CREATE_FAILED', { userId: session.user.id, userRole: 'ADMIN', route: '/api/hierarchy/subfolders', error: (err as Error)?.message, message: 'Failed to create subfolder' })
    return handleApiError(err)
  }
}
