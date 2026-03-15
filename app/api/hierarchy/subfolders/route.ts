import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activityLog'

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
    const { label, eventId } = await req.json()

    if (!label || !eventId) {
      return NextResponse.json(
        { error: 'label and eventId are required.' },
        { status: 400 }
      )
    }

    // Check event exists
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

    const subfolder = await prisma.eventSubfolder.create({
      data: { label, eventId },
      include: { _count: { select: { mediaFiles: true } } },
    })

    await logActivity('SUBFOLDER_CREATED', session.user.id, { label }, eventId)
    return NextResponse.json({ subfolder }, { status: 201 })
  } catch (err) {
    console.error('[hierarchy/subfolders POST]', err)
    return handleApiError(err)
  }
}
