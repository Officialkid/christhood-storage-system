import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { sendWeeklyDigestEmail }     from '@/lib/email'

export const dynamic = 'force-dynamic'

// Only the chief admin receives the weekly digest email
const CHIEF_ADMIN_EMAIL = process.env.CHIEF_ADMIN_EMAIL ?? 'danielmwalili1@gmail.com'

/**
 * GET /api/cron/weekly-digest
 *
 * Called every Monday at 08:00 UTC by Google Cloud Scheduler.
 *
 * Sends a summary of uploads from the past 7 days to all ADMIN + EDITOR users
 * who have not opted out of WEEKLY_DIGEST emails.
 *
 * Secured by Bearer token: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) {
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

  // Only the chief admin receives the weekly digest email
  const recipientEmails: string[] = [CHIEF_ADMIN_EMAIL]

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
