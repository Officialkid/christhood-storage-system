import { NextRequest, NextResponse } from 'next/server'
import { Prisma }                    from '@prisma/client'
import { prisma }                   from '@/lib/prisma'
import { deleteObject }             from '@/lib/r2'
import { log }                      from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/purge-transfers
 *
 * Scheduled daily at 2 am. Deletes R2 objects for transfers that have passed
 * their expiry window, then strips the file/response rows from the database.
 * The Transfer record itself is intentionally kept as a permanent audit trail.
 *
 * Purge rules
 * ───────────
 * 1. COMPLETED transfers  — purge when Transfer.expiresAt is in the past
 *    (expiresAt is set to createdAt + 30 days on completion)
 * 2. PENDING transfers    — purge 60 days after createdAt (forgotten transfers)
 * 3. EXPIRED transfers    — purge immediately on next cron run
 *
 * Authorisation: Bearer token must match the CRON_SECRET env variable.
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const pending60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  // ── Gather eligible transfers ─────────────────────────────────────────────
  //
  // We load files + response.files here so we can delete from R2 without a
  // second query inside the loop.
  const eligible = await prisma.transfer.findMany({
    where: {
      OR: [
        // Rule 1 — COMPLETED with expiresAt in the past
        { status: 'COMPLETED', expiresAt: { lte: now } },
        // Rule 2 — PENDING forgotten for > 60 days
        { status: 'PENDING', createdAt: { lte: pending60d } },
        // Rule 3 — EXPIRED (cancelled or previously expired)
        { status: 'EXPIRED' },
      ],
      // Only purge if there are still files to delete (idempotent guard)
      files: { some: {} },
    },
    include: {
      files:    true,
      response: { include: { files: true } },
    },
  })

  if (eligible.length === 0) {
    return NextResponse.json({
      message:   'No transfers eligible for purge',
      purged:    0,
      skipped:   0,
      r2Errors:  0,
    })
  }

  // ── Per-transfer counters ─────────────────────────────────────────────────
  let purgedCount   = 0
  let skippedCount  = 0
  let r2ErrorCount  = 0

  const purgedIds:  string[] = []
  const skippedIds: string[] = []

  for (const transfer of eligible) {
    const { id: transferId, senderId, recipientId, files, response } = transfer

    // ── Step a–b: delete R2 objects ────────────────────────────────────────
    // Collect every R2 key we need to delete for this transfer
    const r2Keys: string[] = [
      ...files.map(f => f.r2Key),
      ...(response?.files.map(f => f.r2Key) ?? []),
    ]

    let allR2Deleted = true
    for (const key of r2Keys) {
      try {
        await deleteObject(key)
      } catch (err) {
        allR2Deleted = false
        r2ErrorCount++
        console.error(
          `[purge-transfers] R2 delete failed for key "${key}" on transfer ${transferId}:`,
          err,
        )
        // Do NOT abort — continue deleting the remaining objects
      }
    }

    // ── Steps c–e: database cleanup ────────────────────────────────────────
    // Even if some R2 deletes failed we still clean the DB rows so that
    // the orphaned R2 objects don't cause the transfer to be re-queued
    // on the next cron run (the transfer stays but files[] becomes empty).
    try {
      // Use a transaction to keep DB consistent regardless of which optional
      // tables exist.
      const dbOps: Prisma.PrismaPromise<unknown>[] = []

      if (response) {
        // c. Delete TransferResponseFile rows
        dbOps.push(
          prisma.transferResponseFile.deleteMany({
            where: { responseId: response.id },
          }),
        )
        // d. Delete TransferResponse row
        dbOps.push(
          prisma.transferResponse.delete({
            where: { id: response.id },
          }),
        )
      }

      // e. Delete TransferFile rows
      dbOps.push(
        prisma.transferFile.deleteMany({
          where: { transferId },
        }),
      )

      // f. Mark transfer as EXPIRED so the files: { some: {} } guard above
      //    prevents re-queuing on the next run.
      dbOps.push(
        prisma.transfer.update({
          where: { id: transferId },
          data:  { status: 'EXPIRED' },
        }),
      )

      await prisma.$transaction(dbOps)
    } catch (dbErr) {
      console.error(
        `[purge-transfers] DB cleanup failed for transfer ${transferId}:`,
        dbErr,
      )
      skippedCount++
      skippedIds.push(transferId)
      continue
    }

    // ── Step g: activity log ───────────────────────────────────────────────
    const filesDeleted = r2Keys.length
    try {
      await log('TRANSFER_PURGED', senderId, {
        metadata: {
          transferId,
          recipientId,
          filesDeleted,
          hadResponse:    !!response,
          r2ErrorsForJob: allR2Deleted ? 0 : 1,
          purgedAt:       now.toISOString(),
        },
      })
    } catch {
      // Log failure must never abort the purge itself
    }

    purgedCount++
    purgedIds.push(transferId)
  }

  // ── Summary response ───────────────────────────────────────────────────────
  const summary = {
    runAt:     now.toISOString(),
    eligible:  eligible.length,
    purged:    purgedCount,
    skipped:   skippedCount,
    r2Errors:  r2ErrorCount,
    purgedIds,
    skippedIds,
  }

  console.log('[purge-transfers] completed:', JSON.stringify(summary))

  return NextResponse.json(summary)
}
