/**
 * scripts/seed-test-data.mjs
 * Creates test users + folder structure directly in the DB.
 * Run with:  node scripts/seed-test-data.mjs
 *
 * NOTE: "VIEWER" is NOT a valid role in this schema (enum = ADMIN | UPLOADER | EDITOR).
 * The testviewer account is created with role UPLOADER so the DB insert succeeds;
 * it is labelled clearly so you can use it to test "lowest-privilege" scenarios.
 * Unauthorized-access testing is achieved by using the testuploader account against
 * admin-only routes, not via a fake role.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'

// ── Load .env.local (Next.js convention; Prisma only auto-loads .env) ─────────
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
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val   // .env.local always wins over .env placeholder
  })
  console.log('[seed] Loaded .env.local')
} catch {
  console.warn('[seed] .env.local not found — relying on process.env')
}

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertUser({ username, email, password, role, label }) {
  const hash = await bcrypt.hash(password, 12)
  const user = await prisma.user.upsert({
    where:  { email },
    update: { username, passwordHash: hash, role, failedLoginAttempts: 0, lockedUntil: null },
    create: { username, email, passwordHash: hash, role, name: label },
  })
  console.log(`  ✓ ${label.padEnd(22)} | ${role.padEnd(8)} | ${email}`)
  return user
}

async function upsertYear(year) {
  return prisma.year.upsert({
    where:  { year },
    update: {},
    create: { year },
  })
}

async function upsertCategory(name, yearId) {
  const existing = await prisma.eventCategory.findFirst({ where: { name, yearId } })
  if (existing) return existing
  return prisma.eventCategory.create({ data: { name, yearId } })
}

async function upsertEvent(name, date, categoryId) {
  const existing = await prisma.event.findFirst({ where: { name, categoryId } })
  if (existing) return existing
  return prisma.event.create({ data: { name, date, categoryId } })
}

async function upsertSubfolder(label, eventId) {
  const existing = await prisma.eventSubfolder.findFirst({ where: { label, eventId } })
  if (existing) return existing
  return prisma.eventSubfolder.create({ data: { label, eventId } })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  // 1. Users ──────────────────────────────────────────────────────────────────
  console.log('\n[seed] Creating test users...')
  await upsertUser({ username: 'testadmin',    email: 'testadmin@christhood.com',    password: 'TestAdmin123!',  role: 'ADMIN',    label: 'Test Admin'    })
  await upsertUser({ username: 'testuploader', email: 'testuploader@christhood.com', password: 'TestUpload123!', role: 'UPLOADER', label: 'Test Uploader' })
  await upsertUser({ username: 'testeditor',   email: 'testeditor@christhood.com',   password: 'TestEdit123!',  role: 'EDITOR',   label: 'Test Editor'   })
  // "VIEWER" is not a valid enum — created as UPLOADER, used for lowest-priv tests
  await upsertUser({ username: 'testviewer',   email: 'testviewer@christhood.com',   password: 'TestView123!',  role: 'UPLOADER', label: 'Test Viewer (min-priv)' })

  // 2. Folder structure ───────────────────────────────────────────────────────
  console.log('\n[seed] Creating folder structure...')

  const year2026 = await upsertYear(2026)
  console.log(`  ✓ Year 2026`)

  const satFellowships = await upsertCategory('Saturday Fellowships', year2026.id)
  console.log(`  ✓ Category: Saturday Fellowships`)

  const testSaturday = await upsertEvent('Test Saturday Fellowship', today, satFellowships.id)
  console.log(`  ✓ Event: Test Saturday Fellowship`)

  const missions = await upsertCategory('Missions', year2026.id)
  console.log(`  ✓ Category: Missions`)

  const testMission = await upsertEvent('Test Mission Trip', today, missions.id)
  console.log(`  ✓ Event: Test Mission Trip`)

  for (const day of ['Friday', 'Saturday', 'Sunday']) {
    await upsertSubfolder(day, testMission.id)
    console.log(`    ✓ Subfolder: ${day}`)
  }

  // 3. Summary ────────────────────────────────────────────────────────────────
  const userCount   = await prisma.user.count({ where: { email: { contains: '@christhood.com' } } })
  const eventCount  = await prisma.event.count()
  const folderCount = await prisma.eventSubfolder.count()

  console.log('\n────────────────────────────────────────────')
  console.log(`  Test users in DB   : ${userCount}`)
  console.log(`  Total events in DB : ${eventCount}`)
  console.log(`  Subfolders in DB   : ${folderCount}`)
  console.log('────────────────────────────────────────────')
  console.log('\n✅ Seed complete — test environment is ready.\n')
}

main()
  .catch(e => { console.error('[seed] ERROR:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
