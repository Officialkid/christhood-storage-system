import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import { SETTING_DEFAULTS }          from '@/lib/settingDefaults'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/archive
 *
 * Scheduled daily job.  Finds all PUBLISHED or EDITED files whose
 * createdAt is older than the configured archive threshold (default: 6 months)
 * and automatically moves them to ARCHIVED.
 *
 * Authorisation: Bearer token must match CRON_SECRET env variable.
 *
 * Returns: { archived: number, skipped: number, errors: number }
 */
export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = req.headers.get('authorization') ?? ''
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Read threshold setting ────────────────────────────────────────────────
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'archive_threshold_months' },
  })
  const thresholdMonths = parseInt(
    setting?.value ?? SETTING_DEFAULTS['archive_threshold_months'] ?? '6'
  )

  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - thresholdMonths)

  // ── Find eligible files ───────────────────────────────────────────────────
  const eligible = await prisma.mediaFile.findMany({
    where: {
      status:    { in: ['PUBLISHED', 'EDITED'] as any[] },
      createdAt: { lte: cutoffDate },
    },
    select: {
      id:          true,
      originalName: true,
      status:      true,
      eventId:     true,
      uploaderId:  true,
    },
  })

  if (eligible.length === 0) {
    return NextResponse.json({
      message:          'No files eligible for auto-archiving',
      archived:         0,
      thresholdMonths,
      cutoffDate:       cutoffDate.toISOString(),
    })
  }

  const systemUserId = await getSystemUserId()
  const now          = new Date()
  const results      = { archived: 0, errors: 0 }

  for (const file of eligible) {
    try {
      await prisma.mediaFile.update({
        where: { id: file.id },
        data: {
          status:           'ARCHIVED',
          preArchiveStatus: file.status as any,
          archivedAt:       now,
        },
      })

      await log('FILE_ARCHIVED', systemUserId ?? file.uploaderId, {
        mediaFileId: file.id,
        eventId:     file.eventId,
        metadata: {
          fileName:       file.originalName,
          previousStatus: file.status,
          auto:           true,
          thresholdMonths,
        },
      })

      results.archived++
    } catch (err) {
      console.error('[cron/archive] Failed to archive file', file.id, err)
      results.errors++
    }
  }

  return NextResponse.json({
    ok:             true,
    archived:       results.archived,
    errors:         results.errors,
    total:          eligible.length,
    thresholdMonths,
    cutoffDate:     cutoffDate.toISOString(),
  })
}

/**
 * Return the ID of any ADMIN user to attribute system-triggered log entries to.
 * Falls back to the first ADMIN found, or null if no admins exist.
 */
async function getSystemUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where:  { role: 'ADMIN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return admin?.id ?? null
}
