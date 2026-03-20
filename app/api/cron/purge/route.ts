import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import { logger } from '@/lib/logger'
import { sendAdminPurgeAlert, type PurgedFileInfo } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/purge
 *
 * Designed to be called daily by an external cron service (e.g. Vercel Cron,
 * GitHub Actions, or any HTTP scheduler).
 *
 * Authorisation: Bearer token must match CRON_SECRET env variable.
 *
 * For each TrashItem whose scheduledPurgeAt has passed:
 *   1. Delete the R2 object
 *   2. Mark MediaFile as PURGED (status + purgedAt timestamp)
 *   3. Delete the TrashItem row
 *   4. Write a FILE_DELETED log entry (ActivityLog is never cleaned up)
 */
export async function GET(req: NextRequest) {
  // ── Auth: validate CRON_SECRET ────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // ── Find all expired trash items ─────────────────────────────────────────
  const expired = await prisma.trashItem.findMany({
    where:   { scheduledPurgeAt: { lte: now } },
    include: { mediaFile: { include: { event: { select: { name: true } } } } },
  })

  if (expired.length === 0) {
    return NextResponse.json({ message: 'Nothing to purge', purged: 0 })
  }

  const results = {
    purged:  [] as string[],
    failed:  [] as { fileId: string; error: string }[],
  }
  // Collect purged file details for the admin email
  const purgedFileInfo: PurgedFileInfo[] = []

  for (const item of expired) {
    const { mediaFile } = item

    try {
      // 1. Delete from Cloudflare R2
      await deleteObject(mediaFile.r2Key)

      // 2. Mark MediaFile as PURGED in DB + delete TrashItem atomically
      await prisma.$transaction([
        prisma.mediaFile.update({
          where: { id: mediaFile.id },
          data: { status: 'PURGED' as any, purgedAt: now } as any, // new field + new enum value; safe after db push
        }),
        prisma.trashItem.delete({ where: { id: item.id } }),
      ])

      // 3. Log — entry is permanent, even though the file is gone
      await log('FILE_DELETED', item.deletedById, {
        mediaFileId: mediaFile.id,
        eventId:     mediaFile.eventId,
        metadata: {
          fileName:       mediaFile.originalName,
          storedName:     mediaFile.storedName,
          purgedAt:       now.toISOString(),
          permanently:    true,
          deletedAt:      item.deletedAt.toISOString(),
          scheduledPurge: item.scheduledPurgeAt.toISOString(),
        },
      })

      results.purged.push(mediaFile.id)
      purgedFileInfo.push({
        fileName:  mediaFile.originalName,
        eventName: mediaFile.event?.name ?? null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('FILE_PURGE_FAILED', { route: '/api/cron/purge', fileId: mediaFile.id, error: msg, message: 'Cron purge failed for file' })
      results.failed.push({ fileId: mediaFile.id, error: msg })
    }
  }

  logger.info('CRON_PURGE_COMPLETE', { route: '/api/cron/purge', message: `Purged ${results.purged.length} file(s), failed ${results.failed.length}`, metadata: { purged: results.purged.length, failed: results.failed.length, ranAt: now.toISOString() } })

  // ── Email all admins a purge summary (non-fatal) ─────────────────────────
  if (purgedFileInfo.length > 0) {
    try {
      const admins = await prisma.user.findMany({
        where:  { role: 'ADMIN' },
        select: { email: true },
      })
      const adminEmails = admins.map(a => a.email)
      await sendAdminPurgeAlert(adminEmails, purgedFileInfo, now)
    } catch (err) {
      logger.warn('PURGE_SIDE_EFFECT_FAILED', { route: '/api/cron/purge', error: (err as Error)?.message, message: 'sendAdminPurgeAlert failed' })
    }
  }

  // ── Purge expired ZaraConversationLog records (90-day retention) ─────────
  let expiredLogsCount = 0
  try {
    const expiredLogs = await prisma.zaraConversationLog.deleteMany({
      where: { retentionExpiresAt: { lt: now } },
    })
    expiredLogsCount = expiredLogs.count
    if (expiredLogsCount > 0) {
      logger.info('ZARA_LOG_RETENTION_PURGE', { route: '/api/cron/purge', message: `Deleted ${expiredLogsCount} expired ZaraConversationLog record(s)`, metadata: { count: expiredLogsCount } })
    }
  } catch (err) {
    logger.warn('PURGE_SIDE_EFFECT_FAILED', { route: '/api/cron/purge', error: (err as Error)?.message, message: 'ZaraConversationLog retention purge failed' })
  }

  return NextResponse.json({
    message:              `Purged ${results.purged.length} file(s)`,
    purged:               results.purged.length,
    failed:               results.failed.length,
    failedDetails:        results.failed,
    expiredLogsDeleted:   expiredLogsCount,
    ranAt:                now.toISOString(),
  })
}
