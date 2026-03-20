import { NextRequest, NextResponse }  from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'
import { logActivity }                from '@/lib/activityLog'
import { logger }                     from '@/lib/logger'
import { OFFICIAL_CATEGORY_NAMES, OTHER_CATEGORY_SENTINEL } from '@/lib/hierarchyConstants'
import { notifyNewEventCreated }      from '@/lib/notifications'

/**
 * POST /api/hierarchy/events
 * Creates an event. Auto-creates the Year and EventCategory if they don't exist.
 * ADMIN only.
 *
 * Body: { name, date (ISO), categoryName, yearNumber, customCategoryName? }
 *   - categoryName === 'Other': uses customCategoryName as the real category name.
 *   - All other categoryName values are treated as-is (official or existing custom).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, date, categoryName, yearNumber, customCategoryName } = body

    if (!name || !date || !categoryName || !yearNumber) {
      return NextResponse.json(
        { error: 'name, date, categoryName and yearNumber are required.' },
        { status: 400 }
      )
    }

    // ── Resolve effective category name ───────────────────────────────────
    let effectiveCategoryName: string
    let isCustomCreation = false

    if (categoryName === OTHER_CATEGORY_SENTINEL) {
      const custom = (customCategoryName as string | undefined)?.trim()
      if (!custom || custom.length > 80) {
        return NextResponse.json(
          { error: 'Please provide a custom category name (max 80 characters).' },
          { status: 400 }
        )
      }
      effectiveCategoryName = custom
      isCustomCreation = true
    } else {
      effectiveCategoryName = String(categoryName).trim()
      if (!effectiveCategoryName) {
        return NextResponse.json({ error: 'categoryName cannot be empty.' }, { status: 400 })
      }
    }

    const yr = parseInt(String(yearNumber))
    if (isNaN(yr) || yr < 2000 || yr > 2100) {
      return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
    }

    // isDefault = true for the 7 official Christhood category names
    const isDefault = !isCustomCreation &&
      (OFFICIAL_CATEGORY_NAMES as readonly string[]).includes(effectiveCategoryName)

    // ── Upsert Year ───────────────────────────────────────────────────────
    let year = await prisma.year.findUnique({ where: { year: yr } })
    if (!year) {
      year = await prisma.year.create({ data: { year: yr } })
      await logActivity('YEAR_CREATED', session.user.id, { year: yr })
    }

    // ── Prevent creation under an archived category ───────────────────────
    const existingCategory = await prisma.eventCategory.findFirst({
      where: { yearId: year.id, name: effectiveCategoryName },
    })
    if (existingCategory?.isArchived) {
      return NextResponse.json(
        {
          error: `"${effectiveCategoryName}" has been archived. ` +
                 `Unarchive it in Admin → Event Categories to use it again.`,
        },
        { status: 409 }
      )
    }

    // ── Upsert EventCategory ──────────────────────────────────────────────
    let category = existingCategory
    if (!category) {
      category = await prisma.eventCategory.create({
        data: {
          name:            effectiveCategoryName,
          yearId:          year.id,
          isDefault,
          createdByUserId: isCustomCreation ? session.user.id : null,
        },
      })
      await logActivity('CATEGORY_CREATED', session.user.id, {
        name: effectiveCategoryName, year: yr, isCustom: isCustomCreation,
      })
    }

    // ── Duplicate check ───────────────────────────────────────────────────
    const duplicate = await prisma.event.findFirst({
      where: { name, categoryId: category.id },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `An event named "${name}" already exists in ${effectiveCategoryName} ${yr}.` },
        { status: 409 }
      )
    }

    // ── Create Event ──────────────────────────────────────────────────────
    const event = await prisma.event.create({
      data: { name, date: new Date(date), categoryId: category.id },
      include: {
        category: { include: { year: true } },
        subfolders: true,
        _count: { select: { mediaFiles: true } },
      },
    })

    await logActivity('EVENT_CREATED', session.user.id, {
      name, date, categoryName: effectiveCategoryName, year: yr,
    }, event.id)

    notifyNewEventCreated({
      eventId: event.id, eventName: event.name, actorId: session.user.id,
    }).catch(() => {})

    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    logger.error('EVENT_CREATE_FAILED', { userId: session.user.id, userRole: 'ADMIN', route: '/api/hierarchy/events', error: (err as Error)?.message, message: 'Failed to create event' })
    return handleApiError(err)
  }
}

