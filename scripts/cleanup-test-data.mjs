/**
 * scripts/cleanup-test-data.mjs
 * Removes all test users, their uploaded files (R2 + DB), and the test
 * folder structure created by seed-test-data.mjs.
 *
 * Run with:  node scripts/cleanup-test-data.mjs
 *
 * DRY-RUN mode (shows what would be deleted without deleting anything):
 *   DRY_RUN=1 node scripts/cleanup-test-data.mjs
 */

import { PrismaClient }         from '@prisma/client'
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { fileURLToPath }        from 'url'
import { dirname, resolve }     from 'path'
import { readFileSync }         from 'fs'

// ── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = resolve(__dirname, '../.env.local')
try {
  const raw = readFileSync(envPath, 'utf8')
  raw.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) return
    const key = trimmed.slice(0, eqIdx).trim()
    let val    = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  })
  console.log('[cleanup] Loaded .env.local')
} catch {
  console.warn('[cleanup] .env.local not found — relying on process.env')
}

const DRY_RUN = process.env.DRY_RUN === '1'
if (DRY_RUN) console.log('\n⚠️  DRY RUN MODE — no changes will be made\n')

// ── Clients ───────────────────────────────────────────────────────────────────
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

// ── Targets ───────────────────────────────────────────────────────────────────
const TEST_EMAILS = [
  'testadmin@christhood.com',
  'testuploader@christhood.com',
  'testeditor@christhood.com',
  'testviewer@christhood.com',
]
const TEST_EVENT_NAMES = [
  'Test Saturday Fellowship',
  'Test Mission Trip',
]
const TEST_CATEGORY_NAMES = [
  'Saturday Fellowships',
  'Missions',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Delete up to 1000 R2 keys in one batch call. */
async function deleteR2Batch(keys) {
  if (!keys.length) return
  if (DRY_RUN) {
    console.log(`  [DRY] would delete ${keys.length} R2 object(s)`)
    return
  }
  const result = await R2.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: keys.map(k => ({ Key: k })), Quiet: true },
  }))
  if (result.Errors?.length) {
    console.warn('  R2 batch delete errors:', result.Errors)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {

  // 1 ── Collect test users ──────────────────────────────────────────────────
  const testUsers = await prisma.user.findMany({
    where: { email: { in: TEST_EMAILS } },
    select: { id: true, email: true, role: true },
  })
  console.log(`\n[1] Found ${testUsers.length} test user(s):`)
  testUsers.forEach(u => console.log(`    ${u.email} (${u.role})`))

  const testUserIds = testUsers.map(u => u.id)

  // 2 ── Collect test events ─────────────────────────────────────────────────
  const testEvents = await prisma.event.findMany({
    where:   { name: { in: TEST_EVENT_NAMES } },
    select:  { id: true, name: true },
  })
  console.log(`\n[2] Found ${testEvents.length} test event(s):`)
  testEvents.forEach(e => console.log(`    ${e.name} (${e.id})`))

  const testEventIds = testEvents.map(e => e.id)

  // 3 ── Collect all MediaFiles to remove: uploaded by test users OR in test events ──
  const mediaFiles = await prisma.mediaFile.findMany({
    where: {
      OR: [
        { uploaderId: { in: testUserIds } },
        { eventId:    { in: testEventIds } },
      ],
    },
    select: {
      id: true, r2Key: true, originalName: true,
      versions: { select: { r2Key: true } },
    },
  })
  console.log(`\n[3] Found ${mediaFiles.length} media file(s) to delete`)

  // Gather all R2 keys (files + versions)
  const allR2Keys = []
  for (const f of mediaFiles) {
    allR2Keys.push(f.r2Key)
    for (const v of f.versions) allR2Keys.push(v.r2Key)
  }
  console.log(`    Total R2 object(s) to delete: ${allR2Keys.length}`)

  // 4 ── Delete R2 objects ───────────────────────────────────────────────────
  console.log('\n[4] Deleting R2 objects...')
  for (let i = 0; i < allR2Keys.length; i += 1000) {
    await deleteR2Batch(allR2Keys.slice(i, i + 1000))
  }
  if (!DRY_RUN) console.log('    ✓ R2 objects deleted')

  // 5 ── Delete MediaFiles from DB (TrashItems + FileVersions cascade) ───────
  const mediaFileIds = mediaFiles.map(f => f.id)
  if (mediaFileIds.length > 0) {
    console.log('\n[5] Deleting MediaFile records from DB...')
    if (!DRY_RUN) {
      const { count } = await prisma.mediaFile.deleteMany({
        where: { id: { in: mediaFileIds } },
      })
      console.log(`    ✓ Deleted ${count} MediaFile(s) (TrashItems + FileVersions cascade)`)
    } else {
      console.log(`  [DRY] would delete ${mediaFileIds.length} MediaFile record(s)`)
    }
  }

  // 6a ── Delete ActivityLog rows for test users (no cascade on userId FK) ────
  if (testUserIds.length > 0) {
    console.log('\n[6a] Deleting ActivityLog entries for test users...')
    if (!DRY_RUN) {
      const { count } = await prisma.activityLog.deleteMany({
        where: { userId: { in: testUserIds } },
      })
      console.log(`     ✓ Deleted ${count} ActivityLog entry/entries`)
    } else {
      const count = await prisma.activityLog.count({ where: { userId: { in: testUserIds } } })
      console.log(`  [DRY] would delete ${count} ActivityLog entry/entries`)
    }
  }

  // 6b ── Delete TrashItem rows where deletedById = test user (no cascade) ───
  if (testUserIds.length > 0) {
    console.log('\n[6b] Deleting TrashItems created by test users...')
    if (!DRY_RUN) {
      const { count } = await prisma.trashItem.deleteMany({
        where: { deletedById: { in: testUserIds } },
      })
      console.log(`     ✓ Deleted ${count} TrashItem(s)`)
    } else {
      const count = await prisma.trashItem.count({ where: { deletedById: { in: testUserIds } } })
      console.log(`  [DRY] would delete ${count} TrashItem(s)`)
    }
  }

  // 6c ── Delete test users (sessions, notifications, push subs, etc. cascade) ─
  if (testUserIds.length > 0) {
    console.log('\n[6c] Deleting test users...')
    if (!DRY_RUN) {
      const { count } = await prisma.user.deleteMany({
        where: { id: { in: testUserIds } },
      })
      console.log(`     ✓ Deleted ${count} test user(s)`)
    } else {
      console.log(`  [DRY] would delete ${testUserIds.length} test user(s)`)
    }
  }

  // 7 ── Delete test events (subfolders cascade via DB) ──────────────────────
  if (testEventIds.length > 0) {
    console.log('\n[7] Deleting test events...')
    if (!DRY_RUN) {
      // ActivityLog.eventId is SetNull so no pre-delete needed
      const { count } = await prisma.event.deleteMany({
        where: { id: { in: testEventIds } },
      })
      console.log(`    ✓ Deleted ${count} test event(s) (subfolders cascade)`)
    } else {
      console.log(`  [DRY] would delete ${testEventIds.length} test event(s)`)
    }
  }

  // 8 ── Delete test categories (only if now empty) ──────────────────────────
  console.log('\n[8] Checking test categories for remaining events...')
  const categoriesToDelete = []
  for (const catName of TEST_CATEGORY_NAMES) {
    const cat = await prisma.eventCategory.findFirst({
      where:   { name: catName },
      include: { _count: { select: { events: true } } },
    })
    if (!cat) { console.log(`    - "${catName}" not found — skipping`); continue }
    if (cat._count.events === 0) {
      categoriesToDelete.push(cat.id)
      console.log(`    - "${catName}" is empty — will delete`)
    } else {
      console.log(`    - "${catName}" still has ${cat._count.events} event(s) — keeping`)
    }
  }
  if (categoriesToDelete.length > 0 && !DRY_RUN) {
    const { count } = await prisma.eventCategory.deleteMany({
      where: { id: { in: categoriesToDelete } },
    })
    console.log(`    ✓ Deleted ${count} empty test category/categories`)
  } else if (categoriesToDelete.length > 0 && DRY_RUN) {
    console.log(`  [DRY] would delete ${categoriesToDelete.length} category/categories`)
  }

  // 9 ── Summary ─────────────────────────────────────────────────────────────
  const remainingUsers = await prisma.user.count()
  console.log('\n────────────────────────────────────────────')
  if (DRY_RUN) {
    console.log('  DRY RUN complete — no changes were made')
  } else {
    console.log('  ✅ Cleanup complete')
    console.log(`  Remaining users in DB: ${remainingUsers}`)
  }
  console.log('────────────────────────────────────────────\n')
}

main()
  .catch(e => { console.error('[cleanup] ERROR:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
