import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { thumbnailKey } from '@/lib/thumbnail'
import { filterTransferActivityForViewer } from '@/lib/transferActivityPrivacy'
import { logger } from '@/lib/logger'
import { formatStorageLimit, getStorageLimitBytes, getStorageLimitGb } from '@/lib/storage-config'

const DASHBOARD_HIDDEN_TRANSFER_ACTIONS = new Set([
  'TRANSFER_SENT',
  'TRANSFER_DOWNLOADED',
  'TRANSFER_RESPONDED',
  'TRANSFER_RESPONSE_DOWNLOADED',
  'TRANSFER_COMPLETED',
  'TRANSFER_CANCELLED',
  'TRANSFER_PURGED',
  'TRANSFER_INTEGRITY_FAILURE',
])

export async function getDashboardData(userId: string, role: string) {
  const isAdmin = role === 'ADMIN'
  const isEditor = role === 'EDITOR'

  logger.info('DASHBOARD_REQUEST', { userId, userRole: role, route: '/api/dashboard', message: 'Dashboard data requested' })

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [
    statsRaw,
    recentFiles,
    activityRaw,
    upcomingEventsRaw,
    storageGroupsRaw,
    onboardingRaw,
  ] = await Promise.all([
    fetchStats(userId, role, weekAgo, monthStart, todayStart),
    prisma.mediaFile.findMany({
      where: role === 'UPLOADER'
        ? { uploaderId: userId, status: { notIn: ['DELETED', 'PURGED'] } }
        : { status: { notIn: ['DELETED', 'PURGED'] } },
      select: {
        id: true,
        originalName: true,
        storedName: true,
        r2Key: true,
        thumbnailKey: true,
        fileType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        uploader: { select: { name: true, username: true } },
        event: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.activityLog.findMany({
      where: role === 'UPLOADER' ? { userId } : {},
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { name: true, username: true } },
        mediaFile: { select: { originalName: true, event: { select: { name: true } } } },
        event: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    (isAdmin || isEditor)
      ? prisma.event.findMany({
          where: { date: { gte: now, lte: in30Days } },
          select: {
            id: true,
            name: true,
            date: true,
            category: { select: { name: true, year: { select: { year: true } } } },
            _count: { select: { mediaFiles: true } },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
          take: 10,
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.mediaFile.groupBy({
          by: ['fileType'],
          where: { status: { notIn: ['DELETED', 'PURGED'] } },
          _sum: { fileSize: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    fetchOnboardingStatus(userId),
  ])

  const recentUploads = await Promise.all(
    recentFiles.map(async file => {
      let thumbUrl: string | null = null
      try {
        const key = file.thumbnailKey ?? (file.fileType === 'PHOTO' ? null : null)
        if (key) {
          thumbUrl = await getPresignedDownloadUrl(key, 3600)
        } else if (file.fileType === 'PHOTO') {
          thumbUrl = await getPresignedDownloadUrl(file.r2Key, 3600)
        } else {
          const stdKey = thumbnailKey(file.id)
          try {
            thumbUrl = await getPresignedDownloadUrl(stdKey, 3600)
          } catch {}
        }
      } catch {}

      const { r2Key: _r2Key, ...rest } = file
      const videoUrl = file.fileType === 'VIDEO'
        ? await getPresignedDownloadUrl(file.r2Key, 3600).catch(() => null)
        : null

      return { ...rest, thumbnailUrl: thumbUrl, videoUrl, fileSize: file.fileSize.toString() }
    }),
  )

  const activityFiltered = await filterTransferActivityForViewer(activityRaw, userId)
  const activity = activityFiltered
    .filter(entry => !DASHBOARD_HIDDEN_TRANSFER_ACTIONS.has(entry.action))
    .slice(0, 25)
  const storage = isAdmin ? buildStorageSummary(storageGroupsRaw) : null

  logger.info('DASHBOARD_STATS', {
    userId,
    userRole: role,
    route: '/api/dashboard',
    message: 'Dashboard queries completed',
    metadata: {
      recentUploadsCount: recentUploads.length,
      activityCount: activity.length,
      upcomingEventsCount: upcomingEventsRaw.length,
      stats: statsRaw as Record<string, unknown>,
    },
  })

  return {
    role,
    stats: statsRaw,
    recentUploads,
    activity,
    upcomingEvents: upcomingEventsRaw,
    storage,
    onboarding: onboardingRaw,
    generatedAt: now.toISOString(),
  }
}

async function fetchStats(
  userId: string,
  role: string,
  weekAgo: Date,
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
          by: ['userId'],
          where: { createdAt: { gte: todayStart }, userId: { not: null } },
          _max: { createdAt: true },
        }),
        prisma.mediaFile.count({ where: { createdAt: { gte: monthStart }, status: { notIn: ['DELETED', 'PURGED'] } } }),
        prisma.mediaFile.count({
          where: {
            createdAt: {
              gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
              lt: monthStart,
            },
            status: { notIn: ['DELETED', 'PURGED'] },
          },
        }),
      ])

    const activeUserIds = activeGroups
      .map(g => g.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const activeUsersRaw = activeUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: activeUserIds } },
          select: { id: true, name: true, username: true, email: true },
        })
      : []

    const lastSeenMap = new Map(
      activeGroups
        .filter(g => !!g.userId)
        .map(g => [g.userId as string, g._max.createdAt?.toISOString() ?? null]),
    )

    const activeUsers = activeUsersRaw
      .map(u => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        lastSeenAt: lastSeenMap.get(u.id) ?? null,
      }))
      .sort((a, b) => {
        const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
        const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
        return bT - aT
      })

    const monthChangePct = lastMonthUploads > 0
      ? Math.round(((thisMonthUploads - lastMonthUploads) / lastMonthUploads) * 100)
      : null

    logger.info('DASHBOARD_STATS_ADMIN', {
      userId,
      userRole: 'ADMIN',
      route: '/api/dashboard',
      message: 'Admin dashboard stats',
      metadata: { totalFiles, weekUploads, pendingEdit, activeToday: activeGroups.length, thisMonthUploads, lastMonthUploads, monthChangePct },
    })

    return {
      totalFiles,
      weekUploads,
      pendingEdit,
      activeToday: activeGroups.length,
      activeUsers,
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
          action: 'STATUS_CHANGED',
          createdAt: { gte: monthStart },
        },
      }),
    ])

    logger.info('DASHBOARD_STATS_EDITOR', {
      userId,
      userRole: 'EDITOR',
      route: '/api/dashboard',
      message: 'Editor dashboard stats',
      metadata: { filesToEdit, transfersWaiting, editedThisMonth: editActionsThisMonth },
    })

    return { filesToEdit, transfersWaiting, editedThisMonth: editActionsThisMonth }
  }

  const [myTotal, myWeek, myEvents] = await Promise.all([
    prisma.mediaFile.count({ where: { uploaderId: userId, status: { notIn: ['DELETED', 'PURGED'] } } }),
    prisma.mediaFile.count({ where: { uploaderId: userId, createdAt: { gte: weekAgo }, status: { notIn: ['DELETED', 'PURGED'] } } }),
    prisma.event.count({ where: { mediaFiles: { some: { uploaderId: userId } } } }),
  ])

  logger.info('DASHBOARD_STATS_UPLOADER', {
    userId,
    userRole: 'UPLOADER',
    route: '/api/dashboard',
    message: 'Uploader dashboard stats',
    metadata: { myTotal, myWeek, myEvents },
  })

  return { myTotal, myWeek, myEvents }
}

async function fetchOnboardingStatus(userId: string) {
  const safeDefault = {
    dismissed: false,
    items: { uploaded: false, installedPwa: false, setNotifications: false, exploredEvents: false, askedZara: false },
    completedCount: 0,
    totalCount: 5,
  }

  try {
    const [uploads, pushSubs, notifPrefs, zaraUsage, user] = await Promise.all([
      prisma.mediaFile.count({ where: { uploaderId: userId } }),
      prisma.pushSubscription.count({ where: { userId } }),
      prisma.notificationPreference.count({ where: { userId } }),
      prisma.zaraUsageLog.count({ where: { userId } }).catch(() => 0),
      prisma.user.findUnique({
        where: { id: userId },
        select: { hasCompletedOnboarding: true },
      }),
    ])

    const exploredEvents = await prisma.activityLog.count({
      where: { userId, eventId: { not: null } },
    }).then(c => c > 0)

    const items = {
      uploaded: uploads > 0,
      installedPwa: pushSubs > 0,
      setNotifications: notifPrefs > 0,
      exploredEvents,
      askedZara: zaraUsage > 0,
    }

    return {
      dismissed: user?.hasCompletedOnboarding ?? false,
      items,
      completedCount: Object.values(items).filter(Boolean).length,
      totalCount: 5,
    }
  } catch (err) {
    logger.error('DASHBOARD_ONBOARDING_ERROR', { route: '/api/dashboard', error: (err as Error)?.message, message: 'fetchOnboardingStatus failed' })
    return safeDefault
  }
}

type StorageGroup = {
  fileType: string
  _sum: { fileSize: bigint | null }
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

  const limitBytes = getStorageLimitBytes()

  return {
    totalBytes: totalBytes.toString(),
    breakdown,
    limitBytes: limitBytes.toString(),
    limitGB: getStorageLimitGb(),
    limitLabel: formatStorageLimit(),
  }
}
