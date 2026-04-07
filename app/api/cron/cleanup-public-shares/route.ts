/**
 * GET /api/cron/cleanup-public-shares
 *
 * Daily cleanup job — removes expired PublicShareUpload records from the
 * database and deletes the corresponding objects from R2.
 *
 * Also purges abandoned uploads: records where isReady = false and
 * createdAt is older than 2 hours (client never called /confirm).
 *
 * Security: caller must provide the CRON_SECRET env var as a Bearer token in
 * the Authorization header — same pattern as all other cron routes.
 *
 * Google Cloud Scheduler example:
 *   --headers="Authorization=Bearer ${CRON_SECRET}"
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { deleteObject }              from '@/lib/r2'

const BATCH_SIZE         = 100
const ABANDON_AFTER_MINS = 120   // 2 hours

export async function GET(req: NextRequest) {
  // ── Auth: validate Authorization: Bearer <CRON_SECRET> ──────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now          = new Date()
  const abandonCutoff = new Date(now.getTime() - ABANDON_AFTER_MINS * 60 * 1000)

  let deletedExpired  = 0
  let deletedAbandoned = 0
  let r2Errors        = 0

  // ── 1. Delete expired records ─────────────────────────────────────────────
  const expired = await prisma.publicShareUpload.findMany({
    where:  { expiresAt: { lt: now } },
    take:   BATCH_SIZE,
    select: { id: true, r2Key: true },
  })

  for (const record of expired) {
    try { await deleteObject(record.r2Key) } catch { r2Errors++ }
  }

  if (expired.length > 0) {
    await prisma.publicShareUpload.deleteMany({
      where: { id: { in: expired.map(r => r.id) } },
    })
    deletedExpired = expired.length
  }

  // ── 2. Delete abandoned (never confirmed) uploads ─────────────────────────
  const abandoned = await prisma.publicShareUpload.findMany({
    where:  { isReady: false, createdAt: { lt: abandonCutoff } },
    take:   BATCH_SIZE,
    select: { id: true, r2Key: true },
  })

  for (const record of abandoned) {
    // Abandoned records may not have a completed R2 object — ignore 404s
    try { await deleteObject(record.r2Key) } catch { /* expected */ }
  }

  if (abandoned.length > 0) {
    await prisma.publicShareUpload.deleteMany({
      where: { id: { in: abandoned.map(r => r.id) } },
    })
    deletedAbandoned = abandoned.length
  }

  return NextResponse.json({
    ok:              true,
    deletedExpired,
    deletedAbandoned,
    r2Errors,
    ranAt:           now.toISOString(),
  })
}
