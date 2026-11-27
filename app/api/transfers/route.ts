import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { copyObject, deleteObject } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { sendTransferReceivedEmail } from '@/lib/email'
import { getAppSettings } from '@/lib/appSettings'
import { logger } from '@/lib/logger'

interface IncomingFile {
  originalName: string
  r2Key:        string
  fileSize:     number
  mimeType:     string
  folderPath:   string | null
  checksum:     string
}

/**
 * POST /api/transfers
 * Unified Transfer Hub endpoint — available to ALL authenticated CMMS roles (ADMIN, EDITOR, UPLOADER).
 *
 * Supports:
 *  - Freshly uploaded files (`files`) via single PUT or 10MB multipart upload
 *  - Existing CMMS library files (`existingMediaIds`) copied server-side inside R2 with zero re-upload
 *  - Delivery Mode:
 *      1. Teammate (`recipientId` provided) — sends to a CMMS user for download / editing round-trip
 *      2. Instant Link (`deliveryMode === 'link'`) — creates a ShareLink (`/share/[token]`) for WhatsApp / Email / anyone
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    id,
    deliveryMode = 'teammate', // 'teammate' | 'link'
    recipientId: rawRecipientId,
    subject,
    message,
    files = [],
    existingMediaIds = [],
    folderStructure,
    isPinProtected,
    pin,
    expiresInDays,
  } = body

  const isLinkMode  = deliveryMode === 'link' || !rawRecipientId
  const recipientId = isLinkMode ? session.user.id : String(rawRecipientId)

  if (!id || !subject?.trim()) {
    return NextResponse.json({ error: 'Transfer ID and subject/title are required' }, { status: 400 })
  }

  const uploadedFiles = Array.isArray(files) ? (files as IncomingFile[]) : []
  const mediaIds      = Array.isArray(existingMediaIds) ? (existingMediaIds as string[]) : []

  if (uploadedFiles.length === 0 && mediaIds.length === 0) {
    return NextResponse.json({ error: 'Please add at least one file to transfer.' }, { status: 400 })
  }

  const recipient = await prisma.user.findUnique({
    where:  { id: recipientId },
    select: { id: true, email: true, username: true, name: true },
  })
  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
  }

  // Copy any selected existing CMMS MediaFiles server-side in R2 (zero client upload!)
  const copiedR2Keys: string[] = []
  const libraryIncoming: IncomingFile[] = []
  if (mediaIds.length > 0) {
    const dbMedia = await prisma.mediaFile.findMany({
      where: {
        id:     { in: mediaIds },
        status: { notIn: ['DELETED', 'PURGED'] },
      },
      include: {
        event:     { select: { name: true } },
        subfolder: { select: { label: true } },
      },
    })

    for (const mf of dbMedia) {
      const folderLabel = mf.subfolder
        ? `${mf.event.name}/${mf.subfolder.label}`
        : mf.event.name
      const safeFolder = folderLabel.replace(/[\\]+/g, '/').replace(/\.\./g, '')
      const destKey    = `transfers/${id}/cmms/${mf.id}-${mf.originalName}`
      await copyObject(mf.r2Key, destKey)
      copiedR2Keys.push(destKey)

      libraryIncoming.push({
        originalName: mf.originalName,
        r2Key:        destKey,
        fileSize:     Number(mf.fileSize),
        mimeType:     mf.fileType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
        folderPath:   safeFolder,
        checksum:     '',
      })
    }
  }

  const allIncoming = [...uploadedFiles, ...libraryIncoming]
  const fileCount   = allIncoming.length
  const totalBytes  = allIncoming.reduce((s, f) => s + f.fileSize, 0)

  const settings = await getAppSettings()
  const defaultPendingDays = parseInt(settings.transfer_expiry_pending_days ?? '60', 10) || 60
  const effectiveDays = typeof expiresInDays === 'number' && expiresInDays >= 1 && expiresInDays <= 365
    ? expiresInDays
    : isLinkMode ? 14 : defaultPendingDays

  const expiresAt = new Date(Date.now() + effectiveDays * 24 * 60 * 60 * 1000)

  const usePinProtection = Boolean(isPinProtected) && typeof pin === 'string' && /^\d{4,6}$/.test(pin)
  const pinHash = usePinProtection ? await bcrypt.hash(pin as string, 10) : null
  const sharePin4 = Boolean(isPinProtected) && typeof pin === 'string' && /^\d{4}$/.test(pin.slice(0, 4))
    ? await bcrypt.hash(pin.slice(0, 4), 10)
    : null

  const senderName = session.user.username ?? session.user.name ?? session.user.email ?? 'Team Member'

  let transferId: string
  let shareUrl: string | null   = null
  let shareToken: string | null = null

  try {
    const transfer = await prisma.transfer.create({
      data: {
        id,
        senderId:        session.user.id,
        recipientId,
        subject:         subject.trim(),
        message:         message?.trim() || null,
        status:          isLinkMode ? 'COMPLETED' : 'PENDING',
        folderStructure: folderStructure ?? null,
        r2Prefix:        `transfers/${id}/`,
        totalFiles:      fileCount,
        totalSize:       BigInt(totalBytes),
        isPinProtected:  usePinProtection,
        pin:             pinHash,
        expiresAt,
        files: {
          create: allIncoming.map(f => ({
            originalName: f.originalName,
            r2Key:        f.r2Key,
            fileSize:     BigInt(f.fileSize),
            mimeType:     f.mimeType,
            folderPath:   f.folderPath ?? null,
            checksum:     f.checksum ?? '',
          })),
        },
      },
      select: { id: true },
    })
    transferId = transfer.id

    // Always mint an external ShareLink when in Link mode (or whenever requested) so sender gets an instant share URL!
    if (isLinkMode || body.createShareLink) {
      const link = await prisma.shareLink.create({
        data: {
          createdById:    session.user.id,
          linkType:       'TRANSFER',
          transferId,
          title:          subject.trim().slice(0, 120),
          message:        message?.trim()?.slice(0, 500) || null,
          pinHash:        sharePin4,
          isPinProtected: Boolean(sharePin4),
          expiresAt,
        },
      })
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
      shareToken = link.token
      shareUrl   = `${appUrl}/share/${link.token}`
    }
  } catch (dbErr) {
    logger.error('TRANSFER_SEND_FAILED', {
      userId: session.user.id,
      userRole: session.user.role as string,
      route: '/api/transfers',
      error: (dbErr as Error)?.message,
      message: 'Transfer DB create failed — rolling back R2 objects',
    })
    await Promise.allSettled([
      ...uploadedFiles.map(f => deleteObject(f.r2Key)),
      ...copiedR2Keys.map(k => deleteObject(k)),
    ])
    return handleApiError(dbErr, 'transfers/create')
  }

  // Side effects (notifications & activity log)
  const sideEffects: Promise<unknown>[] = [
    log('TRANSFER_SENT', session.user.id, {
      metadata: {
        transferId,
        deliveryMode: isLinkMode ? 'link' : 'teammate',
        recipientId,
        subject:    subject.trim(),
        totalFiles: fileCount,
        totalSize:  totalBytes,
        shareUrl,
      },
    }),
  ]

  if (!isLinkMode && recipientId !== session.user.id) {
    sideEffects.push(
      createInAppNotification(
        recipientId,
        `${senderName} sent you ${fileCount} file${fileCount !== 1 ? 's' : ''}: "${subject.trim()}"`,
        `/transfers/inbox/${transferId}`,
        'TRANSFER_RECEIVED',
        'New Transfer Received',
      ),
      sendPushToUser(recipientId, 'TRANSFER_RECEIVED', {
        title:   '📦 New Transfer Received',
        body:    `${senderName} sent you ${fileCount} file${fileCount !== 1 ? 's' : ''}: "${subject.trim()}"`,
        url:     `/transfers/inbox/${transferId}`,
        tag:     `transfer-${transferId}`,
        type:    'TRANSFER_RECEIVED',
        payload: { transferId, senderName, fileCount, subject: subject.trim() },
      }),
      prisma.notificationPreference.findUnique({
        where: { userId_category: { userId: recipientId, category: 'TRANSFER_RECEIVED' } },
      }).then((pref) => {
        if (pref && !pref.email) return
        return sendTransferReceivedEmail({
          toEmail:    recipient.email,
          toName:     recipient.username ?? recipient.name ?? recipient.email,
          senderName,
          subject:    subject.trim(),
          message:    message?.trim() || null,
          fileCount,
          totalSize:  totalBytes,
          transferId,
        })
      }),
    )
  }

  await Promise.allSettled(sideEffects).catch(() => {})

  return NextResponse.json({
    transferId,
    status:     isLinkMode ? 'COMPLETED' : 'PENDING',
    totalFiles: fileCount,
    totalSize:  totalBytes,
    shareUrl,
    shareToken,
  })
}
