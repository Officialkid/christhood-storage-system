import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { logActivity }                from '@/lib/activityLog'
import { CATEGORY_NAMES }             from '@/lib/hierarchyConstants'
import { notifyNewEventCreated }      from '@/lib/notifications'

/**
 * POST /api/hierarchy/events
 * Creates an event. Auto-creates the Year and EventCategory if they don't exist.
 * ADMIN only.
 *
 * Body: { name, date (ISO), categoryName, yearNumber }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, date, categoryName, yearNumber } = body

    if (!name || !date || !categoryName || !yearNumber) {
      return NextResponse.json(
        { error: 'name, date, categoryName and yearNumber are required.' },
        { status: 400 }
      )
    }

    if (!(CATEGORY_NAMES as readonly string[]).includes(categoryName)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${CATEGORY_NAMES.join(', ')}` },
        { status: 400 }
      )
    }

    const yr = parseInt(String(yearNumber))
    if (isNaN(yr) || yr < 2000 || yr > 2100) {
      return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
    }

    // Upsert Year
    let year = await prisma.year.findUnique({ where: { year: yr } })
    if (!year) {
      year = await prisma.year.create({ data: { year: yr } })
      await logActivity('YEAR_CREATED', session.user.id, { year: yr })
    }

    // Upsert EventCategory under that year
    let category = await prisma.eventCategory.findFirst({
      where: { yearId: year.id, name: categoryName },
    })
    if (!category) {
      category = await prisma.eventCategory.create({
        data: { name: categoryName, yearId: year.id },
      })
      await logActivity('CATEGORY_CREATED', session.user.id, { name: categoryName, year: yr })
    }

    // Create Event
    const event = await prisma.event.create({
      data: {
        name,
        date:       new Date(date),
        categoryId: category.id,
      },
      include: {
        category: { include: { year: true } },
        subfolders: true,
        _count: { select: { mediaFiles: true } },
      },
    })

    await logActivity('EVENT_CREATED', session.user.id, { name, date, categoryName, year: yr }, event.id)

    // Notify all users — fire-and-forget
    notifyNewEventCreated({
      eventId:   event.id,
      eventName: event.name,
      actorId:   session.user.id,
    }).catch(() => {})

    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    console.error('[hierarchy/events POST]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
