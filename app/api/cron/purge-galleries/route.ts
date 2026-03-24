/**
 * GET /api/cron/purge-galleries
 *
 * Runs daily at 03:00 UTC. Two jobs in one pass:
 *
 * 1. PURGE — galleries where status=DELETED and purgesAt <= now:
 *    - Delete all R2 objects (3 keys per file + cover)
 *    - Delete GalleryView, GalleryDownload, GalleryFile, GallerySection rows
 *    - Set status = 'PURGED' (keep the record for auditing)
 *    - Log GALLERY_PURGED
 *
 * 2. WARN — galleries where status=DELETED and purgesAt is within 7 days:
 *    - Send in-app notification + push to the admin who deleted it
 *    - Link: /admin/trash?tab=galleries
 *
 * Authorisation: Bearer token must match CRON_SECRET env variable.
 */

import { NextRequest, NextResponse }               from 'next/server'
import { prisma }                                  from '@/lib/prisma'
import { deleteFromGallery }                       from '@/lib/gallery/gallery-r2'
import { logger }                                  from '@/lib/logger'
import { log }                                     from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })

  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now              = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const results = {
    purged:  [] as string[],
    warned:  [] as string[],
    failed:  [] as { galleryId: string; error: string }[],
  }

  // ── 1. PURGE expired galleries ─────────────────────────────────────────────
  const expiredGalleries = await prisma.publicGallery.findMany({
    where: { status: 'DELETED', purgesAt: { lte: now } },
    select: {
      id:           true,
      title:        true,
      coverImageKey: true,
      deletedById:  true,
      files: { select: { thumbnailKey: true, previewKey: true, originalKey: true } },
    },
  })

  for (const gallery of expiredGalleries) {
    try {
      // Collect and delete all R2 objects
      const r2Keys: string[] = []
      for (const f of gallery.files) {
        r2Keys.push(f.thumbnailKey, f.previewKey, f.originalKey)
      }
      if (gallery.coverImageKey) r2Keys.push(gallery.coverImageKey)

      await Promise.allSettled(r2Keys.map(key => deleteFromGallery(key)))

      // Delete child rows and mark gallery as PURGED
      await prisma.$transaction([
        prisma.galleryView.deleteMany(    { where: { galleryId: gallery.id } }),
        prisma.galleryDownload.deleteMany({ where: { galleryId: gallery.id } }),
        prisma.galleryFile.deleteMany(    { where: { galleryId: gallery.id } }),
        prisma.gallerySection.deleteMany( { where: { galleryId: gallery.id } }),
        prisma.publicGallery.update({
          where: { id: gallery.id },
          data:  { status: 'PURGED' },
        }),
      ])

      if (gallery.deletedById) {
        await log('GALLERY_PURGED', gallery.deletedById, {
          metadata: { galleryId: gallery.id, galleryTitle: gallery.title, fileCount: gallery.files.length },
        })
      }

      results.purged.push(gallery.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('GALLERY_PURGE_FAILED', {
        route:    '/api/cron/purge-galleries',
        message:  `Cron purge failed for gallery "${gallery.title}"`,
        error:    msg,
        metadata: { galleryId: gallery.id },
      })
      results.failed.push({ galleryId: gallery.id, error: msg })
    }
  }

  // ── 2. WARN galleries within 7 days of permanent deletion ──────────────────
  const warningGalleries = await prisma.publicGallery.findMany({
    where: {
      status:   'DELETED',
      purgesAt: { gt: now, lte: sevenDaysFromNow },
    },
    select: { id: true, title: true, purgesAt: true, deletedById: true },
  })

  for (const gallery of warningGalleries) {
    if (!gallery.deletedById || !gallery.purgesAt) continue

    try {
      const daysLeft = Math.ceil(
        (gallery.purgesAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      const message = `⚠️ Gallery "${gallery.title}" will be permanently deleted in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Restore it if you want to keep it.`

      await createInAppNotification(
        gallery.deletedById,
        message,
        '/admin/trash?tab=galleries',
        'GALLERY_PURGE_WARNING',
        'Gallery Purge Warning',
      )

      await sendPushToUser(gallery.deletedById, 'GALLERY_PURGE_WARNING', {
        title: 'Gallery Purge Warning',
        body:  message,
        url:   '/admin/trash?tab=galleries',
        tag:   `gallery-purge-warn-${gallery.id}`,
        type:  'GALLERY_PURGE_WARNING',
      })

      results.warned.push(gallery.id)
    } catch (err) {
      logger.warn('GALLERY_PURGE_WARN_FAILED', {
        route:    '/api/cron/purge-galleries',
        message:  `Failed to send 7-day warning for gallery "${gallery.title}"`,
        error:    err instanceof Error ? err.message : String(err),
        metadata: { galleryId: gallery.id },
      })
    }
  }

  logger.info('CRON_GALLERY_PURGE_COMPLETE', {
    route:    '/api/cron/purge-galleries',
    message:  `Purged ${results.purged.length} gallery/ies, warned ${results.warned.length}, failed ${results.failed.length}`,
    metadata: {
      purged: results.purged.length,
      warned: results.warned.length,
      failed: results.failed.length,
      ranAt:  now.toISOString(),
    },
  })

  return NextResponse.json({
    message:       `Purged ${results.purged.length} gallery/ies`,
    purged:        results.purged.length,
    warned:        results.warned.length,
    failed:        results.failed.length,
    failedDetails: results.failed,
    ranAt:         now.toISOString(),
  })
}
