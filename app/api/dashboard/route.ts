import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'
import { getPresignedDownloadUrl }   from '@/lib/r2'
import { thumbnailKey }              from '@/lib/thumbnail'

export const dynamic = 'force-dynamic'

// ── GET /api/dashboard ────────────────────────────────────────────────────────
// Returns all role-appropriate dashboard data in one shot:
//   stats, recentUploads (with presigned thumbnail URLs), activity feed,
//   upcoming events, storage breakdown (admin), onboarding checklist status.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId   = token.id as string
  const role     = (token.role as string) ?? 'UPLOADER'
  const isAdmin  = role === 'ADMIN'
  const isEditor = role === 'EDITOR'

  const now          = new Date()
  const weekAgo      = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in30Days     = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

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

    // Activity feed — uploaders see only their own; editors/admins see all
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
      take: 25,
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

  // ── Storage summary ────────────────────────────────────────────────────────
  const storage = isAdmin ? buildStorageSummary(storageGroupsRaw) : null

  return NextResponse.json({
    role,
    stats:          statsRaw,
    recentUploads,
    activity:       activityRaw,
    upcomingEvents: upcomingEventsRaw,
    storage,
    onboarding:     onboardingRaw,
    generatedAt:    now.toISOString(),
  })
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
  return { myTotal, myWeek, myEvents }
}

async function fetchOnboardingStatus(userId: string) {
  const [uploads, pushSubs, notifPrefs, zaraUsage, user] = await Promise.all([
    prisma.mediaFile.count({ where: { uploaderId: userId } }),
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.notificationPreference.count({ where: { userId } }),
    prisma.zaraUsageLog.count({ where: { userId } }),
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
    uploaded:        uploads > 0,
    installedPwa:    pushSubs > 0,
    setNotifications: notifPrefs > 0,
    exploredEvents,
    askedZara:       zaraUsage > 0,
  }
  const completedCount = Object.values(items).filter(Boolean).length

  return {
    dismissed:    user?.hasCompletedOnboarding ?? false,
    items,
    completedCount,
    totalCount:   5,
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
