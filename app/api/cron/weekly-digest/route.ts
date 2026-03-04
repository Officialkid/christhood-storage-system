import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { sendWeeklyDigestEmail }     from '@/lib/email'

/**
 * POST /api/cron/weekly-digest
 *
 * Intended to be called every Monday at 08:00 UTC by an external cron service
 * (e.g., Vercel Cron, GitHub Actions, Upstash QStash).
 *
 * Sends a summary of uploads from the past 7 days to all ADMIN + EDITOR users
 * who have not opted out of WEEKLY_DIGEST emails.
 *
 * Secured by Bearer token: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Date range = last 7 days
  const since = new Date()
  since.setDate(since.getDate() - 7)

  // Get all uploads in the window
  const uploads = await prisma.mediaFile.findMany({
    where:   { createdAt: { gte: since }, status: { notIn: ['DELETED', 'PURGED'] as any[] } },
    include: {
      uploader: { select: { username: true, email: true } },
      event:    { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (uploads.length === 0) {
    return NextResponse.json({ ok: true, message: 'No uploads this week — digest skipped.' })
  }

  // Get recipients = ADMIN + EDITOR who have digest email enabled (default true)
  const staffUsers = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { role: 'EDITOR' }] },
    select: { id: true, email: true, username: true, name: true },
  })

  const recipientEmails: string[] = []
  for (const u of staffUsers) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_category: { userId: u.id, category: 'WEEKLY_DIGEST' } },
    })
    const emailEnabled = pref ? pref.email : true  // default on
    if (emailEnabled) recipientEmails.push(u.email)
  }

  if (recipientEmails.length === 0) {
    return NextResponse.json({ ok: true, message: 'No recipients opted in.' })
  }

  await sendWeeklyDigestEmail(recipientEmails, uploads, since)

  return NextResponse.json({
    ok:         true,
    uploadCount: uploads.length,
    recipients:  recipientEmails.length,
  })
}
