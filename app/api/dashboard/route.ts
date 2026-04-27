import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'
import { getPresignedDownloadUrl }   from '@/lib/r2'
import { thumbnailKey }              from '@/lib/thumbnail'
import { filterTransferActivityForViewer } from '@/lib/transferActivityPrivacy'
import { logger }                    from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ── GET /api/dashboard ────────────────────────────────────────────────────────
// Returns all role-appropriate dashboard data in one shot:
//   stats, recentUploads (with presigned thumbnail URLs), activity feed,
//   upcoming events, storage breakdown (admin), onboarding checklist status.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    logger.warn('DASHBOARD_AUTH_FAIL', { route: '/api/dashboard', message: 'getToken returned null — check NEXTAUTH_SECRET env var' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId   = token.id as string
  const role     = (token.role as string) ?? 'UPLOADER'
  const isAdmin  = role === 'ADMIN'
  const isEditor = role === 'EDITOR'

  logger.info('DASHBOARD_REQUEST', { userId, userRole: role, route: '/api/dashboard', message: 'Dashboard data requested' })

  const now          = new Date()
  const weekAgo      = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in30Days     = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  try {
  // ── Fan-out queries ─────────────────────────────────────────────────────────
  const [
    statsRaw,
    recentFiles,
    activityRaw,
    upcomingEventsRaw,
    storageGroupsRaw,
    onboardingRaw,
  ] = await Promise.all([
    // Stats
    fetchStats(userId, role, weekAgo, monthStart, todayStart),

    // Recent uploads (12) — uploaders only see their own
    prisma.mediaFile.findMany({
      where: role === 'UPLOADER'
        ? { uploaderId: userId, status: { notIn: ['DELETED', 'PURGED'] } }
        : { status: { notIn: ['DELETED', 'PURGED'] } },
      select: {
        id:           true,
        originalName: true,
        storedName:   true,
        r2Key:        true,
        thumbnailKey: true,
        fileType:     true,
        fileSize:     true,
        status:       true,
        createdAt:    true,
        uploader: { select: { name: true, username: true } },
        event:    { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),

    // Activity feed — uploaders see only their own; editors/admins see all,
    // then private transfer actions are filtered to sender/recipient only.
    prisma.activityLog.findMany({
      where: role === 'UPLOADER' ? { userId } : {},
      select: {
        id:        true,
        action:    true,
        metadata:  true,
        createdAt: true,
        user:      { select: { name: true, username: true } },
        mediaFile: { select: { originalName: true, event: { select: { name: true } } } },
        event:     { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),

    // Upcoming events (admin + editor only)
    (isAdmin || isEditor)
      ? prisma.event.findMany({
          where: {
            date: { gte: now, lte: in30Days },
          },
          select: {
            id:   true,
            name: true,
            date: true,
            category: {
              select: { name: true, year: { select: { year: true } } },
            },
            _count: { select: { mediaFiles: true } },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
          take: 10,
        })
      : Promise.resolve([]),

    // Storage totals — admin only
    isAdmin
      ? prisma.mediaFile.groupBy({
          by:    ['fileType'],
          where: { status: { notIn: ['DELETED', 'PURGED'] } },
          _sum:  { fileSize: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),

    // Onboarding checklist
    fetchOnboardingStatus(userId),
  ])

  // ── Presign thumbnail URLs (parallel, errors swallowed) ────────────────────
  const recentUploads = await Promise.all(
    recentFiles.map(async file => {
      let thumbUrl: string | null = null
      try {
        const key = file.thumbnailKey ?? (file.fileType === 'PHOTO' ? null : null)
        if (key) {
          thumbUrl = await getPresignedDownloadUrl(key, 3600)
        } else if (file.fileType === 'PHOTO') {
          // For photos without a generated thumbnail, use the full image
          thumbUrl = await getPresignedDownloadUrl(file.r2Key, 3600)
        } else {
          // Check standard thumbnail key location
          const stdKey = thumbnailKey(file.id)
          try {
            thumbUrl = await getPresignedDownloadUrl(stdKey, 3600)
          } catch { /* no thumbnail yet — client will use video element */ }
        }
      } catch { /* swallow */ }
      const { r2Key: _r, ...rest } = file   // strip r2Key from client payload
      return { ...rest, thumbnailUrl: thumbUrl, fileSize: file.fileSize.toString() }
    }),
  )

  const activityFiltered = await filterTransferActivityForViewer(activityRaw, userId)
  const activity = activityFiltered.slice(0, 25)

  // ── Storage summary ────────────────────────────────────────────────────────
  const storage = isAdmin ? buildStorageSummary(storageGroupsRaw) : null

  logger.info('DASHBOARD_STATS', { userId, userRole: role, route: '/api/dashboard', message: 'Dashboard queries completed', metadata: { recentUploadsCount: recentUploads.length, activityCount: activity.length, upcomingEventsCount: upcomingEventsRaw.length, stats: statsRaw as Record<string, unknown> } })

  return NextResponse.json({
    role,
    stats:          statsRaw,
    recentUploads,
    activity,
    upcomingEvents: upcomingEventsRaw,
    storage,
    onboarding:     onboardingRaw,
    generatedAt:    now.toISOString(),
  })

  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; stack?: string }
    logger.error('DASHBOARD_ERROR', { userId, userRole: role, route: '/api/dashboard', error: err?.message, errorCode: err?.code, message: 'Failed to load dashboard data' })
    return NextResponse.json(
      { error: 'Failed to load dashboard data', detail: err?.message ?? 'Unknown error' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchStats(
  userId:     string,
  role:       string,
  weekAgo:    Date,
  monthStart: Date,
  todayStart: Date,
) {
  if (role === 'ADMIN') {
    const [totalFiles, weekUploads, pendingEdit, activeGroups, thisMonthUploads, lastMonthUploads] =
      await Promise.all([
        prisma.mediaFile.count({ where: { status: { notIn: ['DELETED', 'PURGED'] } } }),
        prisma.mediaFile.count({
          where: { createdAt: { gte: weekAgo }, status: { notIn: ['DELETED', 'PURGED'] } },
        }),
        prisma.mediaFile.count({ where: { status: 'RAW' } }),
        prisma.activityLog.groupBy({
          by:    ['userId'],
          where: { createdAt: { gte: todayStart } },
        }),
        prisma.mediaFile.count({ where: { createdAt: { gte: monthStart }, status: { notIn: ['DELETED', 'PURGED'] } } }),
        prisma.mediaFile.count({
          where: {
            createdAt: {
              gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
              lt:  monthStart,
            },
            status: { notIn: ['DELETED', 'PURGED'] },
          },
        }),
      ])

    const monthChangePct = lastMonthUploads > 0
      ? Math.round(((thisMonthUploads - lastMonthUploads) / lastMonthUploads) * 100)
      : null

    logger.info('DASHBOARD_STATS_ADMIN', { userId, userRole: 'ADMIN', route: '/api/dashboard', message: 'Admin dashboard stats', metadata: { totalFiles, weekUploads, pendingEdit, activeToday: activeGroups.length, thisMonthUploads, lastMonthUploads, monthChangePct } })

    return {
      totalFiles,
      weekUploads,
      pendingEdit,
      activeToday:    activeGroups.length,
      monthChangePct,
    }
  }

  if (role === 'EDITOR') {
    const [filesToEdit, transfersWaiting, editActionsThisMonth] = await Promise.all([
      prisma.mediaFile.count({ where: { status: 'RAW' } }),
      prisma.transfer.count({ where: { status: 'PENDING' } }),
      prisma.activityLog.count({
        where: {
          userId,
          action:    'STATUS_CHANGED',
          createdAt: { gte: monthStart },
        },
      }),
    ])
    logger.info('DASHBOARD_STATS_EDITOR', { userId, userRole: 'EDITOR', route: '/api/dashboard', message: 'Editor dashboard stats', metadata: { filesToEdit, transfersWaiting, editedThisMonth: editActionsThisMonth } })
    return { filesToEdit, transfersWaiting, editedThisMonth: editActionsThisMonth }
  }

  // UPLOADER
  const [myTotal, myWeek, myEvents] = await Promise.all([
    prisma.mediaFile.count({
      where: { uploaderId: userId, status: { notIn: ['DELETED', 'PURGED'] } },
    }),
    prisma.mediaFile.count({
      where: { uploaderId: userId, createdAt: { gte: weekAgo }, status: { notIn: ['DELETED', 'PURGED'] } },
    }),
    prisma.event.count({ where: { mediaFiles: { some: { uploaderId: userId } } } }),
  ])
    logger.info('DASHBOARD_STATS_UPLOADER', { userId, userRole: 'UPLOADER', route: '/api/dashboard', message: 'Uploader dashboard stats', metadata: { myTotal, myWeek, myEvents } })
  return { myTotal, myWeek, myEvents }
}

async function fetchOnboardingStatus(userId: string) {
  const safeDefault = {
    dismissed:     false,
    items:         { uploaded: false, installedPwa: false, setNotifications: false, exploredEvents: false, askedZara: false },
    completedCount: 0,
    totalCount:    5,
  }
  try {
    const [uploads, pushSubs, notifPrefs, zaraUsage, user] = await Promise.all([
      prisma.mediaFile.count({ where: { uploaderId: userId } }),
      prisma.pushSubscription.count({ where: { userId } }),
      prisma.notificationPreference.count({ where: { userId } }),
      // ZaraUsageLog table may not exist yet in production; fall back to 0
      prisma.zaraUsageLog.count({ where: { userId } }).catch(() => 0),
      prisma.user.findUnique({
        where:  { id: userId },
        select: { hasCompletedOnboarding: true },
      }),
    ])

    // "Explored events" — have they interacted with any event hierarchy?
    const exploredEvents = await prisma.activityLog.count({
      where: { userId, eventId: { not: null } },
    }).then(c => c > 0)

    const items = {
      uploaded:         uploads > 0,
      installedPwa:     pushSubs > 0,
      setNotifications: notifPrefs > 0,
      exploredEvents,
      askedZara:        zaraUsage > 0,
    }
    const completedCount = Object.values(items).filter(Boolean).length

    return {
      dismissed:    user?.hasCompletedOnboarding ?? false,
      items,
      completedCount,
      totalCount:   5,
    }
  } catch (err) {
    logger.error('DASHBOARD_ONBOARDING_ERROR', { route: '/api/dashboard', error: (err as Error)?.message, message: 'fetchOnboardingStatus failed' })
    return safeDefault
  }
}

type StorageGroup = {
  fileType:  string
  _sum:  { fileSize: bigint | null }
  _count: { _all: number }
}

function buildStorageSummary(groups: StorageGroup[]) {
  let totalBytes = BigInt(0)
  const breakdown: { type: string; bytes: string; count: number }[] = []

  for (const g of groups) {
    const bytes = g._sum.fileSize ?? BigInt(0)
    totalBytes += bytes
    breakdown.push({ type: g.fileType, bytes: bytes.toString(), count: g._count._all })
  }

  return {
    totalBytes: totalBytes.toString(),
    breakdown,
  }
}
