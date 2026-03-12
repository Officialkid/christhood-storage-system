/**
 * scripts/add-login-lockout-fields.mjs
 * Adds failedLoginAttempts and lockedUntil columns to the User table.
 * Run: node scripts/add-login-lockout-fields.mjs
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local so the real DATABASE_URL overrides the placeholder in .env
const envPath = resolve(__dirname, '../.env.local')
try {
  const raw = readFileSync(envPath, 'utf8')
  raw.split('\n').forEach(line => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return
    const eq = t.indexOf('=')
    if (eq === -1) return
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[k] = v   // .env.local always wins
  })
} catch { /* ignore */ }

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0`
  )
  console.log('✓ Column failedLoginAttempts ensured')

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3)`
  )
  console.log('✓ Column lockedUntil ensured')

  console.log('\n✅ Login lockout migration applied.')
} catch (e) {
  console.error('Migration error:', e.message)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
