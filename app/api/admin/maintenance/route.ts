import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { SETTING_DEFAULTS }          from '@/lib/settingDefaults'
import { logger }                    from '@/lib/logger'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)            return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

function setting(rows: { key: string; value: string }[], key: string): string {
  return rows.find(r => r.key === key)?.value ?? SETTING_DEFAULTS[key] ?? ''
}

// ── GET /api/admin/maintenance ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Health checks ────────────────────────────────────────────────────────
  let dbOk = false
  try {
    await prisma.appSetting.count()
    dbOk = true
  } catch { /* db unreachable */ }

  const r2Ok   = !!(process.env.CLOUDFLARE_R2_ACCOUNT_ID  &&
                    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
                    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
                    process.env.CLOUDFLARE_R2_BUCKET_NAME)

  const emailOk = !!process.env.RESEND_API_KEY
  const pushOk  = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

  // ── Live Gemini health check — reuses the cached result from /api/assistant/health
  let aiOk      = false
  let aiMessage = 'Not checked'
  try {
    const appBase = process.env.NEXTAUTH_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const hRes  = await fetch(`${appBase}/api/assistant/health`, {
      signal: AbortSignal.timeout(12_000),
    })
    const hData = await hRes.json() as { status: string; message?: string; detail?: string }
    aiOk      = hData.status === 'ok'
    aiMessage = hData.detail ?? hData.message ?? (aiOk ? 'Connected' : 'Connection failed')
  } catch (hErr: unknown) {
    aiMessage = `Health check failed: ${(hErr as Error).message ?? 'timeout'}`
  }

  // ── Database stats ───────────────────────────────────────────────────────
  const [users, files, events, trashed, logs] = await Promise.all([
    prisma.user.count(),
    prisma.mediaFile.count(),
    prisma.event.count(),
    prisma.trashItem.count(),
    prisma.activityLog.count(),
  ])

  // ── Job statuses ─────────────────────────────────────────────────────────
  const jobKeys = [
    'job_trash_purge_last_run',
    'job_archive_last_run',
    'job_transfer_purge_last_run',
    'job_log_cleanup_last_run',
  ]
  const jobRows = await prisma.appSetting.findMany({
    where: { key: { in: jobKeys } },
  })

  function jobEntry(key: string) {
    const lastRun = jobRows.find(r => r.key === key)?.value || null
    return { lastRun: lastRun || null }
  }

  return NextResponse.json({
    health: { db: dbOk, r2: r2Ok, email: emailOk, ai: aiOk, aiMessage, push: pushOk },
    stats:  { users, files, events, trashed, logs },
    jobs: {
      trash_purge:    jobEntry('job_trash_purge_last_run'),
      archive:        jobEntry('job_archive_last_run'),
      transfer_purge: jobEntry('job_transfer_purge_last_run'),
      log_cleanup:    jobEntry('job_log_cleanup_last_run'),
    },
  })
}

// ── POST /api/admin/maintenance ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = session.user.id
  const body    = await req.json() as { action: string; confirm?: string }
  const action  = body.action
  const now     = new Date()
  const nowIso  = now.toISOString()

  // Helper: record job completion timestamp
  async function stampJob(key: string) {
    await prisma.appSetting.upsert({
      where:  { key },
      create: { key, value: nowIso, updatedBy: adminId },
      update: { value: nowIso, updatedBy: adminId },
    })
  }

  // ── Trash Purge ───────────────────────────────────────────────────────────
  if (action === 'run_trash_purge') {
    const expired = await prisma.trashItem.findMany({
      where:   { scheduledPurgeAt: { lte: now } },
      select:  { id: true, mediaFileId: true },
    })

    for (const item of expired) {
      await prisma.$transaction([
        prisma.mediaFile.update({
          where: { id: item.mediaFileId },
          data:  { status: 'PURGED', purgedAt: now },
        }),
        prisma.trashItem.delete({ where: { id: item.id } }),
      ])
    }

    await stampJob('job_trash_purge_last_run')
    return NextResponse.json({ ok: true, purged: expired.length })
  }

  // ── Archive Job ──────────────────────────────────────────────────────────
  if (action === 'run_archive') {
    const archiveSetting = await prisma.appSetting.findUnique({
      where: { key: 'archive_threshold_months' },
    })
    const months = parseInt(archiveSetting?.value ?? SETTING_DEFAULTS.archive_threshold_months, 10)
    const cutoff = new Date(now)
    cutoff.setMonth(cutoff.getMonth() - months)

    const toArchive = await prisma.mediaFile.findMany({
      where: {
        status:    { in: ['PUBLISHED', 'EDITED'] },
        createdAt: { lte: cutoff },
      },
      select: { id: true, status: true },
    })

    for (const file of toArchive) {
      await prisma.mediaFile.update({
        where: { id: file.id },
        data:  { status: 'ARCHIVED', archivedAt: now, preArchiveStatus: file.status },
      })
    }

    await stampJob('job_archive_last_run')
    return NextResponse.json({ ok: true, archived: toArchive.length })
  }

  // ── Transfer Purge ────────────────────────────────────────────────────────
  if (action === 'run_transfer_purge') {
    const result = await prisma.transfer.updateMany({
      where: {
        expiresAt: { lte: now },
        status:    { notIn: ['EXPIRED', 'COMPLETED'] },
      },
      data: { status: 'EXPIRED' },
    })

    await stampJob('job_transfer_purge_last_run')
    return NextResponse.json({ ok: true, expired: result.count })
  }

  // ── Log Cleanup ───────────────────────────────────────────────────────────
  if (action === 'run_log_cleanup') {
    const cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) // 180 days
    const result = await prisma.activityLog.deleteMany({
      where: { createdAt: { lte: cutoff } },
    })

    await stampJob('job_log_cleanup_last_run')
    return NextResponse.json({ ok: true, deleted: result.count })
  }

  // ── Export Data ───────────────────────────────────────────────────────────
  if (action === 'export_data') {
    if (body.confirm !== 'CONFIRM') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }

    const [users, events, settings] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, username: true, email: true, role: true, createdAt: true, updatedAt: true },
      }),
      prisma.event.findMany({ include: { category: true } }),
      prisma.appSetting.findMany(),
    ])
    const fileCounts = await prisma.mediaFile.groupBy({
      by:     ['status'],
      _count: { _all: true },
    })

    const payload = JSON.stringify(
      { exportedAt: nowIso, users, events, settings, fileCounts },
      null,
      2,
    )

    return new Response(payload, {
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': `attachment; filename="christhood-export-${now.toISOString().split('T')[0]}.json"`,
      },
    })
  }

  // ── Clear Test Data ───────────────────────────────────────────────────────
  if (action === 'clear_test_data') {
    if (body.confirm !== 'CONFIRM') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }

    // Never touch admin accounts
    const testUsers = await prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
        OR: [
          { username: { contains: 'test', mode: 'insensitive' } },
          { email:    { contains: 'test', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })

    const testFiles = await prisma.mediaFile.findMany({
      where: { originalName: { contains: 'test', mode: 'insensitive' } },
      select: { id: true },
    })

    const [deletedFiles, deletedUsers] = await prisma.$transaction([
      prisma.mediaFile.deleteMany({
        where: { id: { in: testFiles.map(f => f.id) } },
      }),
      prisma.user.deleteMany({
        where: { id: { in: testUsers.map(u => u.id) } },
      }),
    ])

    return NextResponse.json({
      ok: true,
      deletedFiles: deletedFiles.count,
      deletedUsers: deletedUsers.count,
    })
  }

  // ── Process Pending Account Deletions ────────────────────────────────────
  // Executes grace-period-expired self-deletion requests.
  // Called manually from the Maintenance tab OR via a scheduled cron webhook.
  if (action === 'process_pending_deletions') {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 h ago

    const pendingUsers = await prisma.user.findMany({
      where: {
        pendingDeletionAt: { lte: cutoff },
        role:              { not: 'ADMIN' }, // safety: never auto-delete admins
      },
      select: { id: true, pendingDeletionAction: true, username: true, email: true },
    })

    if (pendingUsers.length === 0) {
      await stampJob('job_pending_deletions_last_run')
      return NextResponse.json({ ok: true, deleted: 0 })
    }

    // Reassign orphaned files to the admin running the job
    const adminId = session.user.id

    let deleted = 0
    for (const target of pendingUsers) {
      const fileAction = target.pendingDeletionAction ?? 'reassign'

      const userFiles = await prisma.mediaFile.findMany({
        where:  { uploaderId: target.id },
        select: { id: true, status: true },
      })

      try {
        await prisma.$transaction(async (tx) => {
          // ── Handle files ─────────────────────────────────────────────────
          if (fileAction === 'reassign') {
            await tx.mediaFile.updateMany({
              where: { uploaderId: target.id },
              data:  { uploaderId: adminId },
            })
          } else if (fileAction === 'archive') {
            await tx.mediaFile.updateMany({
              where: { uploaderId: target.id },
              data:  { status: 'ARCHIVED', uploaderId: adminId, archivedAt: now },
            })
          } else if (fileAction === 'trash') {
            const trashable = userFiles.filter(
              f => f.status !== 'DELETED' && f.status !== 'PURGED',
            )
            if (trashable.length > 0) {
              const scheduledPurgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
              await tx.trashItem.createMany({
                data: trashable.map(f => ({
                  mediaFileId: f.id, deletedById: adminId,
                  scheduledPurgeAt, preDeleteStatus: f.status,
                })),
                skipDuplicates: true,
              })
              await tx.mediaFile.updateMany({
                where: { id: { in: trashable.map(f => f.id) } },
                data:  { status: 'DELETED', uploaderId: adminId },
              })
            }
            const gone = userFiles
              .filter(f => f.status === 'DELETED' || f.status === 'PURGED')
              .map(f => f.id)
            if (gone.length > 0) {
              await tx.mediaFile.updateMany({
                where: { id: { in: gone } },
                data:  { uploaderId: adminId },
              })
            }
          }

          // ── Re-point non-nullable FKs to admin ────────────────────────────
          await tx.fileVersion.updateMany({ where: { uploadedById: target.id },  data: { uploadedById: adminId } })
          await tx.trashItem.updateMany(  { where: { deletedById:  target.id },  data: { deletedById:  adminId } })
          await tx.transfer.updateMany(   { where: { senderId:     target.id },  data: { senderId:     adminId } })
          await tx.transfer.updateMany(   { where: { recipientId:  target.id },  data: { recipientId:  adminId } })
          await tx.transferResponse.updateMany({ where: { uploadedById: target.id }, data: { uploadedById: adminId } })
          await tx.message.updateMany(    { where: { senderId:     target.id },  data: { senderId:     adminId } })

          // ── Anonymise activity log entries ────────────────────────────────
          await tx.activityLog.updateMany({ where: { userId: target.id }, data: { userId: null } })

          // ── Delete dependent records ──────────────────────────────────────
          await tx.messageRecipient.deleteMany({ where: { recipientId:         target.id } })
          await tx.zaraActionLog.deleteMany(   { where: { requestedByUserId:   target.id } })
          await tx.zaraUsageLog.deleteMany(    { where: { userId:              target.id } })
          await tx.shareLink.deleteMany(       { where: { createdById:         target.id } })
          await tx.account.deleteMany(         { where: { userId:              target.id } })
          await tx.session.deleteMany(         { where: { userId:              target.id } })

          // ── Delete the user ───────────────────────────────────────────────
          await tx.user.delete({ where: { id: target.id } })
        })

        deleted++
      } catch (err) {
        logger.error('MAINTENANCE_USER_DELETE_FAILED', { userId: adminId, userRole: 'ADMIN', route: '/api/admin/maintenance', error: (err as Error)?.message, metadata: { targetUserId: target.id }, message: 'process_pending_deletions: failed for user' })
      }
    }

    await stampJob('job_pending_deletions_last_run')
    return NextResponse.json({ ok: true, deleted })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
