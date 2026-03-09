import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false`
  )
  console.log('✓ Column hasCompletedOnboarding ensured')
} catch (e) {
  console.error('Migration error:', e.message)
} finally {
  await prisma.$disconnect()
}
