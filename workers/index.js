'use strict'

/**
 * Christhood CMMS — Background Worker
 *
 * Runs two recurring jobs using node-cron:
 *
 *   Job 1 — TRASH PURGE        daily at 00:00
 *     Finds TrashItems whose scheduledPurgeAt has passed, deletes the R2
 *     object (and its thumbnail), marks the MediaFile as PURGED, removes
 *     the TrashItem row.
 *
 *   Job 2 — ARCHIVE AUTOMATION  daily at 01:00
 *     Reads the archive_threshold_months AppSetting, finds PUBLISHED/EDITED
 *     files older than the cutoff, and moves them to ARCHIVED status.
 *
 * Environment variables required:
 *   DATABASE_URL
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 */

const cron       = require('node-cron')
const { PrismaClient } = require('@prisma/client')
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')

// ── Clients ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient()

const R2 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME

// ── Logger ─────────────────────────────────────────────────────────────────────
function log(job, message) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${job}] ${message}`)
}

function logError(job, message, err) {
  const ts = new Date().toISOString()
  console.error(`[${ts}] [${job}] ERROR: ${message}`, err?.message ?? err)
}

// ── R2 helper: delete a single key, returns true on success ───────────────────
async function deleteFromR2(key) {
  try {
    await R2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err) {
    logError('R2_DELETE', `Failed to delete key "${key}"`, err)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 1: Trash Purge
// Cron: "0 0 * * *" → runs at 00:00 every day
// ─────────────────────────────────────────────────────────────────────────────
async function runTrashPurge() {
  log('TRASH_PURGE', '─── Job started ────────────────────────────────────')

  const now = new Date()

  // Find all trash items whose 30-day window has expired
  const expired = await prisma.trashItem.findMany({
    where:   { scheduledPurgeAt: { lte: now } },
    include: { mediaFile: true },
  })

  log('TRASH_PURGE', `Found ${expired.length} item(s) due for purge`)

  if (expired.length === 0) {
    log('TRASH_PURGE', '─── Job done (nothing to purge) ────────────────────')
    return
  }

  let purged  = 0
  let failed  = 0

  for (const item of expired) {
    const { mediaFile } = item
    const label = `"${mediaFile.originalName}" (id: ${mediaFile.id})`

    try {
      // 1. Delete primary R2 object
      const r2Ok = await deleteFromR2(mediaFile.r2Key)
      if (!r2Ok) {
        // R2 deletion failed — skip DB update so we retry next run
        failed++
        continue
      }

      // 2. Delete thumbnail from R2 (non-fatal — may not exist)
      if (mediaFile.thumbnailKey) {
        await deleteFromR2(mediaFile.thumbnailKey)
      }

      // 3. Atomically: mark PURGED + delete trash row
      await prisma.$transaction([
        prisma.mediaFile.update({
          where: { id: mediaFile.id },
          data:  { status: 'PURGED', purgedAt: now },
        }),
        prisma.trashItem.delete({ where: { id: item.id } }),
      ])

      log('TRASH_PURGE', `Purged ${label}`)
      purged++

    } catch (err) {
      logError('TRASH_PURGE', `Failed for ${label}`, err)
      failed++
    }
  }

  log('TRASH_PURGE', `─── Job done — purged: ${purged}, failed: ${failed} ───`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 2: Archive Automation
// Cron: "0 1 * * *" → runs at 01:00 every day
// ─────────────────────────────────────────────────────────────────────────────
async function runArchive() {
  log('ARCHIVE', '─── Job started ────────────────────────────────────')

  // Read configurable threshold from AppSetting (default: 6 months)
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'archive_threshold_months' },
  })
  const thresholdMonths = setting ? parseInt(setting.value, 10) : 6

  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - thresholdMonths)

  log('ARCHIVE', `Threshold: ${thresholdMonths} months — cutoff: ${cutoffDate.toISOString()}`)

  // Find eligible files: PUBLISHED or EDITED, created before the cutoff
  const eligible = await prisma.mediaFile.findMany({
    where: {
      status:    { in: ['PUBLISHED', 'EDITED'] },
      createdAt: { lte: cutoffDate },
    },
    select: { id: true, originalName: true, status: true },
  })

  log('ARCHIVE', `Found ${eligible.length} eligible file(s) to archive`)

  if (eligible.length === 0) {
    log('ARCHIVE', '─── Job done (nothing to archive) ──────────────────')
    return
  }

  const now      = new Date()
  let   archived = 0
  let   failed   = 0

  for (const file of eligible) {
    try {
      await prisma.mediaFile.update({
        where: { id: file.id },
        data:  {
          status:           'ARCHIVED',
          preArchiveStatus: file.status,
          archivedAt:       now,
        },
      })
      log('ARCHIVE', `Archived "${file.originalName}" (was ${file.status})`)
      archived++
    } catch (err) {
      logError('ARCHIVE', `Failed for "${file.originalName}" (id: ${file.id})`, err)
      failed++
    }
  }

  log('ARCHIVE', `─── Job done — archived: ${archived}, failed: ${failed} ───`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule jobs
//
// node-cron syntax: "minute hour day-of-month month day-of-week"
//
//   "0 0 * * *"  → minute=0, hour=0  → runs at 00:00 (midnight) every day
//   "0 1 * * *"  → minute=0, hour=1  → runs at 01:00 every day
//   "*/5 * * * *"→ every 5 minutes (useful for testing)
//
// All times are in the system timezone (UTC inside Docker containers).
// ─────────────────────────────────────────────────────────────────────────────

// Daily at midnight UTC
cron.schedule('0 0 * * *', () => {
  runTrashPurge().catch(err => logError('TRASH_PURGE', 'Unhandled top-level error', err))
})

// Daily at 01:00 UTC
cron.schedule('0 1 * * *', () => {
  runArchive().catch(err => logError('ARCHIVE', 'Unhandled top-level error', err))
})

// ─────────────────────────────────────────────────────────────────────────────
// Startup banner
// ─────────────────────────────────────────────────────────────────────────────
log('WORKER', '════════════════════════════════════════════════════')
log('WORKER', ' Christhood CMMS background worker started')
log('WORKER', ' Trash purge   → daily at 00:00 UTC (0 0 * * *)')
log('WORKER', ' Archive auto  → daily at 01:00 UTC (0 1 * * *)')
log('WORKER', `' R2 bucket     → ${BUCKET ?? '(CLOUDFLARE_R2_BUCKET_NAME not set)'}`)
log('WORKER', '════════════════════════════════════════════════════')

// Verify env vars on startup — warn loudly if missing
const REQUIRED_ENV = [
  'DATABASE_URL',
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
]
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    log('WORKER', `WARNING: environment variable "${key}" is not set`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// Docker sends SIGTERM before SIGKILL.  We disconnect Prisma cleanly so in-
// flight transactions can finish before the process exits.
// ─────────────────────────────────────────────────────────────────────────────
async function shutdown(signal) {
  log('WORKER', `Received ${signal} — disconnecting Prisma and exiting…`)
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
