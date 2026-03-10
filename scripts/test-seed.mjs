import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('Creating test users...')
  const users = [
    { username: 'testadmin',    email: 'testadmin@christhood.com',    role: 'ADMIN',    pw: 'TestAdmin123!' },
    { username: 'testuploader', email: 'testuploader@christhood.com', role: 'UPLOADER', pw: 'TestUpload123!' },
    { username: 'testeditor',   email: 'testeditor@christhood.com',   role: 'EDITOR',   pw: 'TestEdit123!' },
  ]
  for (const u of users) {
    const hash = await bcrypt.hash(u.pw, 12)
    const r = await db.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, role: u.role, username: u.username },
      create: { username: u.username, email: u.email, role: u.role, passwordHash: hash, name: u.username }
    })
    console.log(`  [OK] ${u.username} (${u.role}) id=${r.id}`)
  }

  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  const year  = await db.year.upsert({ where: { year: 2026 }, update: {}, create: { year: 2026 } })
  console.log(`  [OK] Year 2026 id=${year.id}`)

  // findOrCreate pattern since no unique constraint on name+yearId
  let satCat = await db.eventCategory.findFirst({ where: { name: 'Saturday Fellowships', yearId: year.id } })
  if (!satCat) satCat = await db.eventCategory.create({ data: { name: 'Saturday Fellowships', yearId: year.id } })
  console.log(`  [OK] Category: Saturday Fellowships id=${satCat.id}`)

  let missionsCat = await db.eventCategory.findFirst({ where: { name: 'Missions', yearId: year.id } })
  if (!missionsCat) missionsCat = await db.eventCategory.create({ data: { name: 'Missions', yearId: year.id } })
  console.log(`  [OK] Category: Missions id=${missionsCat.id}`)

  let satEvent = await db.event.findFirst({ where: { name: 'Test Saturday Fellowship', categoryId: satCat.id } })
  if (!satEvent) satEvent = await db.event.create({ data: { name: 'Test Saturday Fellowship', categoryId: satCat.id, date: new Date(), createdById: admin.id } })
  console.log(`  [OK] Event: Test Saturday Fellowship id=${satEvent.id}`)

  let missionEvent = await db.event.findFirst({ where: { name: 'Test Mission Trip', categoryId: missionsCat.id } })
  if (!missionEvent) missionEvent = await db.event.create({ data: { name: 'Test Mission Trip', categoryId: missionsCat.id, date: new Date(), createdById: admin.id } })
  console.log(`  [OK] Event: Test Mission Trip id=${missionEvent.id}`)

  for (const day of ['Friday','Saturday','Sunday']) {
    let sf = await db.eventSubfolder.findFirst({ where: { label: day, eventId: missionEvent.id } })
    if (!sf) sf = await db.eventSubfolder.create({ data: { label: day, eventId: missionEvent.id } })
    console.log(`  [OK] Subfolder: ${day} id=${sf.id}`)
  }

  const uCount = await db.user.count()
  const eCount = await db.event.count()
  const fileCount = await db.mediaFile.count()
  console.log(`\n=== SETUP COMPLETE: ${uCount} users | ${eCount} events | ${fileCount} files ===`)
  console.log(`satEventId=${satEvent.id}`)
}
main().catch(e => { console.error('[FATAL]', e.message); process.exit(1) }).finally(() => db.$disconnect())
