import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { sendTransferReceivedEmail } from '@/lib/email'
import { logger }                    from '@/lib/logger'

const EXPIRY_DAYS = 60

// Binary formats — packaged with STORE (no recompression, byte-for-byte identical)
const STORE_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','mp4','mov','avi','heic',
  'raw','cr2','nef','arw','dng','orf','rw2',
  'tiff','tif','psd','ai','pdf',
])

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
 * Admin and Editor only. Called after the client has uploaded all files to R2 via presigned URLs.
 * Creates the Transfer + TransferFile DB records, fires notifications, writes activity log.
 * On DB failure, deletes all uploaded R2 objects to prevent orphaned files.
 *
 * Permission model:
 *   ADMIN  — can send to anyone
 *   EDITOR — can send to anyone
 *   UPLOADER — forbidden
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(['ADMIN', 'EDITOR'] as string[]).includes(session.user.role as string)) {
    return NextResponse.json(
      { error: 'Only Admins and Editors can send file transfers.' },
      { status: 403 },
    )
  }

  const body = await req.json()
  const { id, recipientId, subject, message, files, folderStructure, isPinProtected, pin } = body

  if (!id || !recipientId || !subject?.trim() || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate recipient
  const recipient = await prisma.user.findUnique({
    where:  { id: recipientId },
    select: { id: true, email: true, username: true, name: true },
  })
  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
  }

  const incomingFiles = files as IncomingFile[]
  const fileCount  = incomingFiles.length
  const totalBytes = incomingFiles.reduce((s, f) => s + f.fileSize, 0)

  // Log checksums for audit trail (server-side integrity record)
  logger.info('TRANSFER_SENT', { userId: session.user.id, userRole: session.user.role as string, route: '/api/transfers', transferId: id, message: `Transfer ${id} initiated: ${fileCount} file(s) to recipient ${recipientId}`, metadata: { fileCount, totalBytes } })
  for (const f of incomingFiles) {
    const ext  = f.originalName.split('.').pop()?.toLowerCase() ?? ''
    const mode = STORE_EXTENSIONS.has(ext) ? 'STORE' : 'DEFLATE'
    logger.debug('TRANSFER_FILE_CHECKSUM', { route: '/api/transfers', transferId: id, message: `checksum=${f.checksum}  mode=${mode}  size=${f.fileSize}` })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  // Hash PIN if provided (validate format server-side before hashing)
  const usePinProtection = Boolean(isPinProtected) && typeof pin === 'string' && /^\d{4,6}$/.test(pin)
  const pinHash = usePinProtection ? await bcrypt.hash(pin as string, 10) : null

  const senderName = session.user.username ?? session.user.name ?? session.user.email ?? 'Admin'

  // ── Atomic DB write ────────────────────────────────────────────────────────
  let transferId: string
  try {
    const transfer = await prisma.transfer.create({
      data: {
        id,
        senderId:        session.user.id,
        recipientId,
        subject:         subject.trim(),
        message:         message?.trim() || null,
        status:          'PENDING',
        folderStructure: folderStructure ?? null,
        r2Prefix:        `transfers/${id}/`,
        totalFiles:      fileCount,
        totalSize:       BigInt(totalBytes),
        isPinProtected:  usePinProtection,
        pin:             pinHash,
        expiresAt,
        files: {
          create: incomingFiles.map(f => ({
            originalName: f.originalName,
            r2Key:        f.r2Key,
            fileSize:     BigInt(f.fileSize),
            mimeType:     f.mimeType,
            folderPath:   f.folderPath ?? null,
            checksum:     f.checksum,
          })),
        },
      },
      select: { id: true },
    })
    transferId = transfer.id
  } catch (dbErr) {
    // DB write failed — purge all R2 objects the client already uploaded
    logger.error('TRANSFER_SEND_FAILED', { userId: session.user.id, userRole: session.user.role as string, route: '/api/transfers', error: (dbErr as Error)?.message, errorCode: (dbErr as any)?.code, message: 'Transfer DB create failed — rolling back R2 objects' })
    await Promise.allSettled(incomingFiles.map(f => deleteObject(f.r2Key)))
    return handleApiError(dbErr, 'transfers/create')
  }

  // ── Fire-and-forget side-effects ───────────────────────────────────────────
  // Never let notification/email failures affect the response.
  Promise.allSettled([
    // 1. Activity log
    log('TRANSFER_SENT', session.user.id, {
      metadata: {
        transferId,
        recipientId,
        recipientEmail: recipient.email,
        subject:        subject.trim(),
        totalFiles:     fileCount,
        totalSize:      totalBytes,
      },
    }),

    // 2. In-app notification
    createInAppNotification(
      recipientId,
      `${senderName} sent you ${fileCount} file${fileCount !== 1 ? 's' : ''}: "${subject.trim()}"`,
      '/transfers/inbox',
    ),

    // 3. Web push (respects user preference opt-out)
    sendPushToUser(recipientId, 'TRANSFER_RECEIVED', {
      title:   '📦 New Transfer Received',
      body:    `${senderName} sent you ${fileCount} file${fileCount !== 1 ? 's' : ''}: "${subject.trim()}"`,
      url:     '/transfers/inbox',
      tag:     `transfer-${transferId}`,
      type:    'TRANSFER_RECEIVED',
      payload: { transferId, senderName, fileCount, subject: subject.trim() },
    }),

    // 4. Email — respect TRANSFER_RECEIVED email preference (default: send)
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
      })
    }),
  ]).catch(() => {})

  return NextResponse.json({
    transferId,
    status:     'PENDING',
    totalFiles: fileCount,
    totalSize:  totalBytes,
  })
}
