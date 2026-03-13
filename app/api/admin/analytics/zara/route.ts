import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }         from 'next-auth'
import { authOptions }              from '@/lib/auth'
import { prisma }                   from '@/lib/prisma'

function toNum(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0)
}

function getDateRange(period: string): { startDate: Date; truncUnit: string } {
  const now = new Date()
  switch (period) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { startDate: start, truncUnit: 'hour' }
    }
    case 'month': {
      const start = new Date(now)
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      return { startDate: start, truncUnit: 'day' }
    }
    case 'week':
    default: {
      const start = new Date(now)
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      return { startDate: start, truncUnit: 'day' }
    }
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user)               return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden'    }, { status: 403 })

  const period = req.nextUrl.searchParams.get('period') ?? 'week'
  const { startDate, truncUnit } = getDateRange(period)

  // Today's midnight for Gemini daily usage (always today, not filtered by period)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // ── Run main queries in parallel ───────────────────────────────────────────
  const [
    overviewAgg,
    usageByUserRaw,
    uniqueUsersRaw,
    topToolsRaw,
    actionConversionAgg,
    usageByPageRaw,
    dailyStatsRaw,
    recentActions,
    totalUsers,
    dailyRequestsAgg,
  ] = await Promise.all([

    // 1. Overview aggregate
    prisma.zaraUsageLog.aggregate({
      where: { startedAt: { gte: startDate } },
      _count: { id: true },
      _avg:   { responseTimeMs: true },
      _sum:   { actionsConfirmed: true },
    }),

    // 2. Usage by user (top 10, for table)
    prisma.zaraUsageLog.groupBy({
      by:    ['userId'],
      where: { startedAt: { gte: startDate } },
      _count: { id: true },
      _max:   { startedAt: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),

    // 3. All unique users (for count in overview)
    prisma.zaraUsageLog.groupBy({
      by:    ['userId'],
      where: { startedAt: { gte: startDate } },
    }),

    // 4. Top tools (unnest array column)
    prisma.$queryRaw<{ tool: string; count: bigint }[]>`
      SELECT unnest("toolsUsed") AS tool, COUNT(*) AS count
      FROM   "ZaraUsageLog"
      WHERE  "startedAt" >= ${startDate}
        AND  cardinality("toolsUsed") > 0
      GROUP  BY tool
      ORDER  BY count DESC
      LIMIT  10
    `,

    // 5. Action conversion totals
    prisma.zaraUsageLog.aggregate({
      where: { startedAt: { gte: startDate } },
      _sum: {
        actionsProposed:  true,
        actionsConfirmed: true,
        actionsCancelled: true,
      },
    }),

    // 6. Usage by page (top 6)
    prisma.zaraUsageLog.groupBy({
      by:    ['pageContext'],
      where: { startedAt: { gte: startDate } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 6,
    }),

    // 7. Daily / hourly time-series (raw SQL for date truncation)
    prisma.$queryRaw<{ day: Date; conversations: bigint; actions_taken: bigint; errors: bigint }[]>`
      SELECT
        DATE_TRUNC(${truncUnit}, "startedAt")  AS day,
        COUNT(*)                               AS conversations,
        SUM("actionsConfirmed")                AS actions_taken,
        SUM("errorCount")                      AS errors
      FROM  "ZaraUsageLog"
      WHERE "startedAt" >= ${startDate}
      GROUP BY day
      ORDER BY day ASC
    `,

    // 8. Recent action log entries (last 5)
    prisma.zaraActionLog.findMany({
      take:    5,
      orderBy: { createdAt: 'desc' },
      include: { requestedBy: { select: { name: true, username: true } } },
    }),

    // 9. Total user count for overview context
    prisma.user.count(),

    // 10. Today's message count (Gemini request approximation)
    prisma.zaraUsageLog.aggregate({
      where: { startedAt: { gte: todayStart } },
      _sum:  { messageCount: true },
    }),
  ])

  // ── Fetch user details for usage-by-user table ─────────────────────────────
  const userIds = usageByUserRaw.map(r => r.userId)
  const [users, topFeatureRows] = await Promise.all([
    prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, name: true, username: true, role: true },
    }),
    // Top tool per user (single CTE query)
    userIds.length > 0
      ? prisma.$queryRaw<{ userId: string; tool: string }[]>`
          WITH ranked AS (
            SELECT
              "userId",
              unnest("toolsUsed")                                        AS tool,
              COUNT(*)                                                   AS cnt
            FROM  "ZaraUsageLog"
            WHERE "userId" = ANY(${userIds})
              AND "startedAt" >= ${startDate}
              AND cardinality("toolsUsed") > 0
            GROUP BY "userId", tool
          ),
          top1 AS (
            SELECT *,
              ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY cnt DESC) AS rn
            FROM ranked
          )
          SELECT "userId", tool FROM top1 WHERE rn = 1
        `
      : Promise.resolve([] as { userId: string; tool: string }[]),
  ])

  const userMap     = Object.fromEntries(users.map(u => [u.id, u]))
  const featureMap  = Object.fromEntries(topFeatureRows.map(r => [r.userId, r.tool]))

  // ── Date formatter ─────────────────────────────────────────────────────────
  const dayFmt =
    period === 'today'
      ? (d: Date) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', hour12: true })
      : period === 'week'
      ? (d: Date) => new Date(d).toLocaleDateString('en-US', { weekday: 'short' })
      : (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // ── Build response ─────────────────────────────────────────────────────────

  const overview = {
    totalConversations: overviewAgg._count.id,
    uniqueUsers:        uniqueUsersRaw.length,
    totalUsers,
    actionsTaken:       overviewAgg._sum.actionsConfirmed ?? 0,
    avgResponseTimeMs:  Math.round(overviewAgg._avg.responseTimeMs ?? 0),
  }

  const usageOverTime = dailyStatsRaw.map(r => ({
    date:          dayFmt(r.day),
    conversations: toNum(r.conversations),
    actionsTaken:  toNum(r.actions_taken),
  }))

  const topTools = topToolsRaw.map(r => ({
    toolName:  r.tool,
    callCount: toNum(r.count),
  }))

  const proposed  = actionConversionAgg._sum.actionsProposed  ?? 0
  const confirmed = actionConversionAgg._sum.actionsConfirmed ?? 0
  const cancelled = actionConversionAgg._sum.actionsCancelled ?? 0
  const actionConversion = {
    confirmed,
    cancelled,
    expired: Math.max(0, proposed - confirmed - cancelled),
  }

  const usageByUser = usageByUserRaw.map(r => {
    const u = userMap[r.userId]
    return {
      userId:          r.userId,
      name:            u?.name     ?? 'Unknown',
      username:        u?.username ?? '',
      role:            u?.role     ?? 'UPLOADER',
      conversations:   r._count.id,
      lastUsed:        r._max.startedAt
        ? new Date(r._max.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Never',
      mostUsedFeature: featureMap[r.userId] ?? 'ask question',
    }
  })

  const totalPageConvos = usageByPageRaw.reduce((s, r) => s + r._count.id, 0)
  const usageByPage = usageByPageRaw.map(r => ({
    page:       r.pageContext || 'Unknown',
    count:      r._count.id,
    percentage: totalPageConvos > 0
      ? Math.round((r._count.id / totalPageConvos) * 100)
      : 0,
  }))

  const errorRate = dailyStatsRaw.map(r => {
    const convos  = toNum(r.conversations)
    const errors  = toNum(r.errors)
    const rate    = convos > 0 ? Math.round((errors / convos) * 100) : 0
    return {
      date:     dayFmt(r.day),
      errorRate: rate,
      hasSpike:  rate > 10,
    }
  })

  // Gemini usage — derived from session logs (best estimate without server-side counters)
  const DAILY_REQ_LIMIT = 1500
  const RPM_LIMIT       = 15
  const TOKENS_LIMIT    = 1_000_000
  const dailyRequests   = toNum(dailyRequestsAgg._sum.messageCount)

  const geminiUsage = {
    dailyRequests,
    dailyRequestsLimit: DAILY_REQ_LIMIT,
    peakRpm:            0,        // not tracked in DB; shown as N/A
    rpmLimit:           RPM_LIMIT,
    tokensToday:        0,        // not tracked in DB; shown as N/A
    tokensLimit:        TOKENS_LIMIT,
  }

  return NextResponse.json({
    overview,
    usageOverTime,
    topTools,
    actionConversion,
    usageByUser,
    usageByPage,
    errorRate,
    geminiUsage,
    recentActions,
    period,
    generatedAt: new Date().toISOString(),
  })
}
