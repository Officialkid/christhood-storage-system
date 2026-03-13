const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Test accounts
  const users = await prisma.user.findMany({
    where: { username: { in: ['testadmin','testuploader','testeditor'] } },
    select: { id: true, username: true, name: true, role: true, email: true, failedLoginAttempts: true, lockedUntil: true }
  });
  console.log('=== TEST ACCOUNTS ===');
  console.log(JSON.stringify(users, null, 2));

  // File distribution across events
  const fileCount = await prisma.mediaFile.count({ where: { purgedAt: null } });
  console.log('\n=== LIVE FILE COUNT:', fileCount, '===');

  const filesByEvent = await prisma.mediaFile.groupBy({
    by: ['eventId'],
    where: { purgedAt: null },
    _count: true,
    orderBy: { _count: { eventId: 'desc' } },
    take: 5,
  });
  console.log('\n=== FILES BY EVENT (top 5) ===');
  console.log(JSON.stringify(filesByEvent, null, 2));

  // Sample files
  const sampleFiles = await prisma.mediaFile.findMany({
    where: { purgedAt: null },
    take: 5,
    select: { id: true, originalName: true, status: true, eventId: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n=== SAMPLE FILES (latest 5) ===');
  console.log(JSON.stringify(sampleFiles, null, 2));

  // Trash
  const trashCount = await prisma.trashItem.count();
  const trashItems = await prisma.trashItem.findMany({
    take: 5,
    include: { mediaFile: { select: { id: true, originalName: true } } },
    orderBy: { deletedAt: 'desc' }
  });
  console.log('\n=== TRASH COUNT:', trashCount, '===');
  console.log(JSON.stringify(trashItems.map(t => ({
    id: t.id,
    fileId: t.mediaFileId,
    file: t.mediaFile.originalName,
    deletedAt: t.deletedAt,
    purgeAt: t.scheduledPurgeAt,
    daysLeft: Math.ceil((new Date(t.scheduledPurgeAt) - Date.now()) / 86400000)
  })), null, 2));

  // Events that have files
  const events = await prisma.event.findMany({
    take: 10,
    include: {
      _count: { select: { mediaFiles: { where: { purgedAt: null } } } },
      category: { include: { year: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n=== EVENTS WITH FILES ===');
  console.log(JSON.stringify(events.map(e => ({
    name: e.name,
    category: e.category.name,
    year: e.category.year.year,
    fileCount: e._count.mediaFiles
  })), null, 2));

  // Recent activity log
  const recentActivity = await prisma.activityLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { action: true, createdAt: true, userId: true, metadata: true }
  });
  console.log('\n=== RECENT ACTIVITY LOG (last 10) ===');
  console.log(JSON.stringify(recentActivity, null, 2));

  await prisma.$disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
