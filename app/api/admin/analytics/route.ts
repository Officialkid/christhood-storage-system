import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import { Prisma }           from '@prisma/client'

// Converts BigInt values coming out of $queryRaw to numbers so JSON.stringify works
function toNum(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0)
}

const LIMIT_GB = parseFloat(process.env.STORAGE_LIMIT_GB ?? '50')

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Run all aggregations in parallel ─────────────────────────────────────
  const [
    totalAgg,
    trashAgg,
    byStatus,
    byFileType,
    byYear,
    byCategory,
    uploadActivity,
    topUploaders,
    mostDownloaded,
    recentDaysRaw,
  ] = await Promise.all([

    // 1. Total storage (exclude PURGED)
    prisma.mediaFile.aggregate({
      _sum:   { fileSize: true },
      _count: { id:       true },
      where:  { status: { notIn: ['PURGED' as any] } },
    }),

    // 2. Trash storage (DELETED files pending purge)
    prisma.mediaFile.aggregate({
      _sum:  { fileSize: true },
      _count: { id:      true },
      where: { status: 'DELETED' as any },
    }),

    // 3. Breakdown by status (exclude PURGED)
    prisma.mediaFile.groupBy({
      by:    ['status'],
      _sum:  { fileSize: true },
      _count: { id:      true },
      where: { status: { notIn: ['PURGED' as any] } },
    }),

    // 4. Breakdown by file type (exclude PURGED)
    prisma.mediaFile.groupBy({
      by:    ['fileType'],
      _sum:  { fileSize: true },
      _count: { id:      true },
      where: { status: { notIn: ['PURGED' as any] } },
    }),

    // 5. Storage by year (raw join)
    prisma.$queryRaw<{ year: number; totalBytes: bigint; fileCount: number }[]>`
      SELECT y.year,
             SUM(m."fileSize")::bigint  AS "totalBytes",
             COUNT(m.id)::int           AS "fileCount"
      FROM   "MediaFile" m
      JOIN   "Event"         e  ON e.id  = m."eventId"
      JOIN   "EventCategory" ec ON ec.id = e."categoryId"
      JOIN   "Year"          y  ON y.id  = ec."yearId"
      WHERE  m.status != 'PURGED'
      GROUP  BY y.year
      ORDER  BY y.year DESC
    `,

    // 6. Storage by category (top 15)
    prisma.$queryRaw<{ category: string; totalBytes: bigint; fileCount: number }[]>`
      SELECT ec.name                          AS category,
             SUM(m."fileSize")::bigint        AS "totalBytes",
             COUNT(m.id)::int                 AS "fileCount"
      FROM   "MediaFile"     m
      JOIN   "Event"         e  ON e.id  = m."eventId"
      JOIN   "EventCategory" ec ON ec.id = e."categoryId"
      WHERE  m.status != 'PURGED'
      GROUP  BY ec.id, ec.name
      ORDER  BY "totalBytes" DESC
      LIMIT  15
    `,

    // 7. Monthly upload activity — last 13 months
    prisma.$queryRaw<{ month: string; uploadCount: number; totalBytes: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(id)::int                                        AS "uploadCount",
             SUM("fileSize")::bigint                              AS "totalBytes"
      FROM   "MediaFile"
      WHERE  "createdAt" >= NOW() - INTERVAL '13 months'
        AND  status != 'PURGED'
      GROUP  BY DATE_TRUNC('month', "createdAt")
      ORDER  BY DATE_TRUNC('month', "createdAt") ASC
    `,

    // 8. Top 10 uploaders by storage
    prisma.$queryRaw<{ id: string; name: string; fileCount: number; totalBytes: bigint }[]>`
      SELECT u.id,
             COALESCE(u.username, u.email)      AS name,
             COUNT(m.id)::int                   AS "fileCount",
             SUM(m."fileSize")::bigint          AS "totalBytes"
      FROM   "MediaFile" m
      JOIN   "User"      u ON u.id = m."uploaderId"
      WHERE  m.status != 'PURGED'
      GROUP  BY u.id, u.username, u.email
      ORDER  BY "totalBytes" DESC
      LIMIT  10
    `,

    // 9. Top 10 most downloaded files via ActivityLog
    prisma.$queryRaw<{
      id: string; originalName: string; fileType: string
      downloadCount: number; eventName: string
    }[]>`
      SELECT m.id,
             m."originalName",
             m."fileType",
             e.name                             AS "eventName",
             COUNT(a.id)::int                   AS "downloadCount"
      FROM   "ActivityLog" a
      JOIN   "MediaFile"   m ON m.id = a."mediaFileId"
      JOIN   "Event"       e ON e.id = m."eventId"
      WHERE  a.action = 'FILE_DOWNLOADED'
        AND  a."mediaFileId" IS NOT NULL
      GROUP  BY m.id, m."originalName", m."fileType", e.name
      ORDER  BY "downloadCount" DESC
      LIMIT  10
    `,

    // 10. Daily uploads for the last 30 days (for sparkline)
    prisma.$queryRaw<{ day: string; uploadCount: number }[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(id)::int                                          AS "uploadCount"
      FROM   "MediaFile"
      WHERE  "createdAt" >= NOW() - INTERVAL '30 days'
        AND  status != 'PURGED'
      GROUP  BY DATE_TRUNC('day', "createdAt")
      ORDER  BY DATE_TRUNC('day', "createdAt") ASC
    `,
  ])

  // ── Fill in missing months so chart has 13 continuous data points ─────────
  const monthlyMap = new Map(uploadActivity.map(r => [r.month, r]))
  const monthlyFilled = Array.from({ length: 13 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (12 - i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = monthlyMap.get(key)
    return {
      month:       key,
      label:       d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      uploadCount: row ? toNum(row.uploadCount) : 0,
      totalBytes:  row ? toNum(row.totalBytes)  : 0,
    }
  })

  // ── Serialise and return ──────────────────────────────────────────────────
  const limitBytes = LIMIT_GB * 1_073_741_824

  return NextResponse.json({
    overview: {
      totalBytes:   toNum(totalAgg._sum.fileSize),
      totalFiles:   totalAgg._count.id,
      limitBytes,
      limitGB:      LIMIT_GB,
      trashBytes:   toNum(trashAgg._sum.fileSize),
      trashFiles:   trashAgg._count.id,
      usedPct:      Math.min(100, Math.round((toNum(totalAgg._sum.fileSize) / limitBytes) * 100)),
    },
    byStatus: byStatus.map(r => ({
      status:     r.status,
      fileCount:  r._count.id,
      totalBytes: toNum(r._sum.fileSize),
    })),
    byFileType: byFileType.map(r => ({
      fileType:   r.fileType,
      fileCount:  r._count.id,
      totalBytes: toNum(r._sum.fileSize),
    })),
    byYear: byYear.map(r => ({
      year:       r.year,
      fileCount:  toNum(r.fileCount),
      totalBytes: toNum(r.totalBytes),
    })),
    byCategory: byCategory.map(r => ({
      category:   r.category,
      fileCount:  toNum(r.fileCount),
      totalBytes: toNum(r.totalBytes),
    })),
    monthly:  monthlyFilled,
    daily: recentDaysRaw.map(r => ({
      day:         r.day,
      uploadCount: toNum(r.uploadCount),
    })),
    topUploaders: topUploaders.map(r => ({
      id:         r.id,
      name:       r.name,
      fileCount:  toNum(r.fileCount),
      totalBytes: toNum(r.totalBytes),
    })),
    mostDownloaded: mostDownloaded.map(r => ({
      id:            r.id,
      originalName:  r.originalName,
      fileType:      r.fileType,
      eventName:     r.eventName,
      downloadCount: toNum(r.downloadCount),
    })),
    generatedAt: new Date().toISOString(),
  })
}
