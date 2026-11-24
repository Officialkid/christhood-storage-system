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
    const { name, date, categoryName, yearNumber, customCategoryName, subfolders } = body

    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName || !categoryName || !yearNumber) {
      return NextResponse.json(
        { error: 'Event title, category, and year are required.' },
        { status: 400 }
      )
    }

    // Parse optional date
    let parsedDate: Date | null = null
    if (date !== undefined && date !== null && String(date).trim() !== '') {
      const d = new Date(date)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid date format.' }, { status: 400 })
      }
      parsedDate = d
    }

    // Normalize optional initial subfolders (e.g. ["Day 1", "Day 2", "Day 3"])
    const normalizedSubfolders: string[] = []
    if (Array.isArray(subfolders)) {
      const seen = new Set<string>()
      for (const raw of subfolders) {
        const label = typeof raw === 'string' ? raw.trim() : ''
        if (!label || label.length > 80) continue
        const key = label.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        normalizedSubfolders.push(label)
      }
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
      where: { name: trimmedName, categoryId: category.id },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `An event named "${trimmedName}" already exists in ${effectiveCategoryName} ${yr}.` },
        { status: 409 }
      )
    }

    // ── Create Event (+ optional initial subfolders) ──────────────────────
    const event = await prisma.event.create({
      data: {
        name:       trimmedName,
        date:       parsedDate,
        categoryId: category.id,
        ...(normalizedSubfolders.length > 0
          ? { subfolders: { create: normalizedSubfolders.map(label => ({ label })) } }
          : {}),
      },
      include: {
        category: { include: { year: true } },
        subfolders: {
          orderBy: { label: 'asc' },
          include: { _count: { select: { mediaFiles: true } } },
        },
        _count: { select: { mediaFiles: true } },
      },
    })

    await logActivity('EVENT_CREATED', session.user.id, {
      name: trimmedName,
      date: parsedDate ? parsedDate.toISOString() : null,
      categoryName: effectiveCategoryName,
      year: yr,
      subfolders: normalizedSubfolders,
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

