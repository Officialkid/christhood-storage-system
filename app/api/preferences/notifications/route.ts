import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { NotificationCategory }      from '@/lib/notifications'

const ALL_CATEGORIES: NotificationCategory[] = [
  'UPLOAD_IN_FOLLOWED_FOLDER',
  'FILE_STATUS_CHANGED',
  'NEW_EVENT_CREATED',
  'FILE_RESTORED',
  'WEEKLY_DIGEST',
  'FILE_PUBLISHED_ALERT',
  'STORAGE_THRESHOLD_ALERT',
  // Communications categories
  'TRANSFER_RECEIVED',
  'TRANSFER_RESPONDED',
  'TRANSFER_COMPLETED',
  'TRANSFER_CANCELLED',
  'DIRECT_MESSAGE',
]

/**
 * GET /api/preferences/notifications
 * Returns current user's notification preferences + followed folders.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rawPrefs, follows, allEvents] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: session.user.id } }),
    prisma.folderFollow.findMany({
      where:   { userId: session.user.id },
      include: { event: { select: { id: true, name: true } } },
    }),
    prisma.event.findMany({
      select:  { id: true, name: true },
      orderBy: { date: 'desc' },
    }),
  ])

  // Build a complete preferences map (fill defaults for any missing category)
  const prefsMap: Record<string, { push: boolean; email: boolean }> = {}
  for (const cat of ALL_CATEGORIES) {
    prefsMap[cat] = { push: true, email: true }
  }
  for (const p of rawPrefs) {
    prefsMap[p.category] = { push: p.push, email: p.email }
  }

  const followedEventIds = follows.map((f) => f.eventId)

  return NextResponse.json({
    preferences: prefsMap,
    followedEventIds,
    allEvents,
  })
}

/**
 * PUT /api/preferences/notifications
 * Body: {
 *   preferences: Record<NotificationCategory, { push: boolean; email: boolean }>,
 *   followedEventIds: string[]
 * }
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { preferences, followedEventIds } = body ?? {}

  if (!preferences || typeof preferences !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const userId = session.user.id

  // Upsert all category preferences
  await Promise.all(
    ALL_CATEGORIES.map((cat) => {
      const { push = true, email = true } = (preferences as Record<string, { push?: boolean; email?: boolean }>)[cat] ?? {}
      return prisma.notificationPreference.upsert({
        where:  { userId_category: { userId, category: cat } },
        create: { userId, category: cat, push, email },
        update: { push, email },
      })
    }),
  )

  // Sync folder follows — delete all then recreate
  if (Array.isArray(followedEventIds)) {
    await prisma.folderFollow.deleteMany({ where: { userId } })
    if (followedEventIds.length > 0) {
      // Validate that the event IDs exist
      const validEvents = await prisma.event.findMany({
        where:  { id: { in: followedEventIds } },
        select: { id: true },
      })
      const validIds = validEvents.map((e) => e.id)
      if (validIds.length > 0) {
        await prisma.folderFollow.createMany({
          data:             validIds.map((eventId) => ({ userId, eventId })),
          skipDuplicates:   true,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
