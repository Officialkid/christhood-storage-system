import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/admin/assistant/training-insights?period=week|month
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id || (token.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? 'month'
  const days   = period === 'week' ? 7 : 30
  const since  = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // ── 1. Most Common Intents ────────────────────────────────────────────────
  const intentRows = await prisma.zaraConversationLog.groupBy({
    by:        ['intentCategory'],
    where:     { messageType: 'USER', intentCategory: { not: null }, createdAt: { gte: since } },
    _count:    { intentCategory: true },
    orderBy:   { _count: { intentCategory: 'desc' } },
  })
  const intents = intentRows.map(r => ({
    intent: r.intentCategory!,
    count:  r._count.intentCategory,
  }))

  // ── 2. Sessions with Many Follow-ups (5+ user messages) ──────────────────
  const sessionCounts = await prisma.zaraConversationLog.groupBy({
    by:     ['sessionId', 'pageContext'],
    where:  { messageType: 'USER', createdAt: { gte: since } },
    _count: { sessionId: true },
    having: { sessionId: { _count: { gte: 5 } } },
    orderBy: { _count: { sessionId: 'desc' } },
    take:   20,
  })
  // Attach createdAt for each session (first message)
  const sessionIds = sessionCounts.map(s => s.sessionId)
  const sessionDates = await prisma.zaraConversationLog.findMany({
    where:    { sessionId: { in: sessionIds }, messageType: 'USER' },
    select:   { sessionId: true, createdAt: true },
    distinct: ['sessionId'],
    orderBy:  { createdAt: 'asc' },
  })
  const dateMap = Object.fromEntries(sessionDates.map(s => [s.sessionId, s.createdAt]))
  const highFollowUp = sessionCounts.map(s => ({
    sessionId:   s.sessionId,
    messageCount: s._count.sessionId,
    pageContext:  s.pageContext,
    date:         dateMap[s.sessionId] ?? null,
  }))

  // ── 3. Off-Topic Attempts ─────────────────────────────────────────────────
  const offTopicTotal = await prisma.zaraConversationLog.count({
    where: { intentCategory: 'OFF_TOPIC', messageType: 'USER', createdAt: { gte: since } },
  })
  const offTopicSamples = await prisma.zaraConversationLog.findMany({
    where:   { intentCategory: 'OFF_TOPIC', messageType: 'USER', createdAt: { gte: since } },
    select:  { userMessageCleaned: true, pageContext: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take:    10,
  })

  // ── 4. Action Cancellation Patterns ──────────────────────────────────────
  const actionRows = await prisma.zaraConversationLog.groupBy({
    by:      ['actionProposed', 'actionOutcome'],
    where:   { actionProposed: { not: null }, createdAt: { gte: since } },
    _count:  { actionProposed: true },
    orderBy: { _count: { actionProposed: 'desc' } },
  })
  // Aggregate into per-tool confirmed+cancelled counts
  const actionMap: Record<string, { confirmed: number; cancelled: number; expired: number }> = {}
  for (const row of actionRows) {
    const key = row.actionProposed!
    if (!actionMap[key]) actionMap[key] = { confirmed: 0, cancelled: 0, expired: 0 }
    if (row.actionOutcome === 'CONFIRMED')  actionMap[key].confirmed  += row._count.actionProposed
    if (row.actionOutcome === 'CANCELLED')  actionMap[key].cancelled  += row._count.actionProposed
    if (row.actionOutcome === 'EXPIRED')    actionMap[key].expired    += row._count.actionProposed
  }
  const actionPatterns = Object.entries(actionMap).map(([tool, counts]) => ({
    tool, ...counts,
  }))

  // ── 5. Error Report Topics ────────────────────────────────────────────────
  const errorReports = await prisma.zaraConversationLog.findMany({
    where:   { intentCategory: 'ERROR_REPORT', messageType: 'USER', createdAt: { gte: since } },
    select:  { userMessageCleaned: true, pageContext: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take:    10,
  })

  // ── 6. Summary counts ─────────────────────────────────────────────────────
  const totalLogs  = await prisma.zaraConversationLog.count({ where: { createdAt: { gte: since } } })
  const totalUsers = await prisma.zaraConversationLog.groupBy({
    by:    ['anonymousUserId'],
    where: { createdAt: { gte: since } },
  })

  return NextResponse.json({
    period,
    summary: {
      totalLogs,
      uniqueUsers: totalUsers.length,
    },
    intents,
    highFollowUp,
    offTopic: {
      total:   offTopicTotal,
      samples: offTopicSamples,
    },
    actionPatterns,
    errorReports,
  })
}
