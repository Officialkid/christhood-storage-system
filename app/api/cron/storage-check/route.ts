import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { sendStorageThresholdEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const STORAGE_THRESHOLD_PERCENT = parseInt(process.env.STORAGE_THRESHOLD_PERCENT ?? '80')
const STORAGE_LIMIT_GB          = parseFloat(process.env.STORAGE_LIMIT_GB         ?? '50')
// Only the chief admin receives critical system alert emails
const CHIEF_ADMIN_EMAIL         = process.env.CHIEF_ADMIN_EMAIL ?? 'danielmwalili1@gmail.com'

/**
 * GET /api/cron/storage-check
 *
 * Sums all non-purged file sizes in the DB (a reliable proxy for R2 usage).
 * If usage ≥ STORAGE_THRESHOLD_PERCENT (default 80%) of STORAGE_LIMIT_GB (default 50 GB),
 * sends an alert email to all ADMIN users who haven't opted out.
 *
 * Secured by Bearer token: Authorization: Bearer <CRON_SECRET>
 * Triggered by Google Cloud Scheduler (GET request with Authorization header).
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

  // Sum all non-purged files
  const agg = await prisma.mediaFile.aggregate({
    _sum:  { fileSize: true },
    where: { status: { notIn: ['PURGED'] as any[] } },
  })

  const totalBytes = Number(agg._sum?.fileSize ?? 0)
  const totalGB    = totalBytes / 1_073_741_824
  const limitGB    = STORAGE_LIMIT_GB
  const pct        = Math.round((totalGB / limitGB) * 100)

  if (pct < STORAGE_THRESHOLD_PERCENT) {
    return NextResponse.json({ ok: true, pct, totalGB: totalGB.toFixed(2), limitGB, threshold: STORAGE_THRESHOLD_PERCENT, alerted: false })
  }

  // Only the chief admin receives storage alert emails
  const recipientEmails: string[] = [CHIEF_ADMIN_EMAIL]

  if (recipientEmails.length > 0) {
    await sendStorageThresholdEmail(recipientEmails, { pct, totalGB, limitGB, thresholdPct: STORAGE_THRESHOLD_PERCENT })
  }

  return NextResponse.json({ ok: true, pct, totalGB: totalGB.toFixed(2), limitGB, threshold: STORAGE_THRESHOLD_PERCENT, alerted: true, recipients: recipientEmails.length })
}
