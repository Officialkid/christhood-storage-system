/**
 * scripts/seed-trash-item.cjs
 * Seeds exactly one TrashItem using the oldest RAW file in the DB.
 * Run: node scripts/seed-trash-item.cjs
 * Prerequisite: DATABASE_URL must be in .env.local
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  // Check if there already is a trash item
  const existing = await prisma.trashItem.count()
  if (existing > 0) {
    console.log(`Trash already has ${existing} item(s) — nothing to do.`)
    await prisma.$disconnect()
    return
  }

  // Get the oldest RAW file not already in trash
  const file = await prisma.mediaFile.findFirst({
    where:   { status: 'RAW', trashItem: null },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, originalName: true, status: true, uploaderId: true },
  })

  if (!file) {
    console.log('No eligible RAW files found. Trash seeding skipped.')
    await prisma.$disconnect()
    return
  }

  console.log(`Seeding trash with: "${file.originalName}" (id: ${file.id})`)

  const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const trash = await prisma.trashItem.create({
    data: {
      mediaFileId:      file.id,
      deletedById:      file.uploaderId,
      scheduledPurgeAt: purgeAt,
      preDeleteStatus:  file.status,
    },
  })

  console.log(`✓ TrashItem created — id: ${trash.id}`)
  console.log(`  Purges: ${purgeAt.toDateString()} (30 days from now)`)
  console.log(`  File "${file.originalName}" is now soft-deleted.`)
  console.log()
  console.log('R4 (getTrashContents) and A3 (restoreFileFromTrash) tests can now run.')

  await prisma.$disconnect()
})().catch(e => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
