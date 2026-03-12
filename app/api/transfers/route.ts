import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/activityLog'
import { createInAppNotification, sendPushToUser } from '@/lib/notifications'
import { sendTransferReceivedEmail } from '@/lib/email'

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
 * Admin-only. Called after the client has uploaded all files to R2 via presigned URLs.
 * Creates the Transfer + TransferFile DB records, fires notifications, writes activity log.
 * On DB failure, deletes all uploaded R2 objects to prevent orphaned files.
 *
 * Quality guarantee:
 *   - Files are stored in R2 exactly as uploaded — zero recompression, no resizing.
 *   - SHA-256 checksums supplied by the client are persisted verbatim for integrity verification.
 *   - ZIP assembly (future download endpoint) will use STORE for binary formats
 *     and DEFLATE only for plaintext (txt, csv, xml, json).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, recipientId, subject, message, files, folderStructure } = body

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
  // Note: r2Keys are not logged here to avoid exposing internal storage paths.
  console.info(`[transfer] NEW — id=${id}  files=${fileCount}`)
  for (const f of incomingFiles) {
    const ext  = f.originalName.split('.').pop()?.toLowerCase() ?? ''
    const mode = STORE_EXTENSIONS.has(ext) ? 'STORE' : 'DEFLATE'
    console.info(`[transfer]   checksum=${f.checksum}  mode=${mode}  size=${f.fileSize}`)
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

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
    console.error('[transfer] DB create failed — rolling back R2 objects:', dbErr)
    await Promise.allSettled(incomingFiles.map(f => deleteObject(f.r2Key)))
    return NextResponse.json(
      { error: 'Failed to record transfer. Uploaded files have been removed. Please try again.' },
      { status: 500 },
    )
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
      title: 'New file transfer',
      body:  `${senderName}: ${subject.trim()}`,
      url:   '/transfers/inbox',
    }),

    // 4. Email
    sendTransferReceivedEmail({
      toEmail:    recipient.email,
      toName:     recipient.username ?? recipient.name ?? recipient.email,
      senderName,
      subject:    subject.trim(),
      message:    message?.trim() || null,
      fileCount,
      totalSize:  totalBytes,
    }),
  ]).catch(() => {})

  return NextResponse.json({
    transferId,
    status:     'PENDING',
    totalFiles: fileCount,
    totalSize:  totalBytes,
  })
}
