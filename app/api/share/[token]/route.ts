import { NextRequest, NextResponse } from 'next/server'
import bcrypt                        from 'bcryptjs'
import { prisma }                    from '@/lib/prisma'
import { getPresignedDownloadUrl }   from '@/lib/r2'

function extractIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

/**
 * GET /api/share/[token]
 * Public endpoint — no authentication required.
 *
 * Query params:
 *   pin?  — 4-digit PIN if the link requires one
 *
 * Returns the link metadata and file list (or an error).
 * A ShareLinkAccess row is created on every valid page view.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const pin = req.nextUrl.searchParams.get('pin') ?? null

  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      createdBy: { select: { username: true, name: true, email: true } },
    },
  })

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  // ── State checks ───────────────────────────────────────────────────────────
  if (link.isRevoked) {
    return NextResponse.json({ error: 'This link has been deactivated by the sender.' }, { status: 410 })
  }
  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This link has expired. Please contact the sender for a new one.' }, { status: 410 })
  }
  if (link.maxDownloads != null && link.downloadCount >= link.maxDownloads) {
    return NextResponse.json({ error: 'This link has reached its download limit.' }, { status: 410 })
  }

  // ── PIN check ──────────────────────────────────────────────────────────────
  if (link.pinHash) {
    if (!pin) {
      // Return 401 with hasPin so the client shows the PIN entry form
      return NextResponse.json({ requiresPin: true }, { status: 401 })
    }
    const pinOk = await bcrypt.compare(pin, link.pinHash)
    if (!pinOk) {
      return NextResponse.json({ error: 'Incorrect PIN. Please try again.' }, { status: 403 })
    }
  }

  // ── Log access (page view) ─────────────────────────────────────────────────
  const ip        = extractIp(req)
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  prisma.shareLinkAccess.create({
    data: { shareLinkId: link.id, ipAddress: ip, userAgent, downloaded: false },
  }).catch((e: unknown) => console.warn('[share/view] access log failed:', e))

  // ── Resolve file list ──────────────────────────────────────────────────────
  const senderName = link.createdBy.username ?? link.createdBy.name ?? 'Admin'

  let files: {
    id: string; name: string; size: number; sizeLabel: string
    mimeType: string; folderPath: string | null; canPreview: boolean
  }[] = []
  let adminEmail = link.createdBy.email

  if (link.linkType === 'FILE' && link.fileId) {
    const f = await prisma.mediaFile.findUnique({
      where:  { id: link.fileId },
      select: { id: true, originalName: true, fileSize: true, fileType: true },
    })
    if (f) {
      files = [{
        id:         f.id,
        name:       f.originalName,
        size:       Number(f.fileSize),
        sizeLabel:  fmtSize(Number(f.fileSize)),
        mimeType:   f.fileType,
        folderPath: null,
        canPreview: f.fileType === 'PHOTO',
      }]
    }
  } else if (link.linkType === 'EVENT' && link.eventId) {
    const where = link.subfolderId
      ? { eventId: link.eventId, subfolderId: link.subfolderId }
      : { eventId: link.eventId }
    const mediaFiles = await prisma.mediaFile.findMany({
      where:   { ...where, status: { notIn: ['DELETED', 'PURGED'] } },
      select:  {
        id: true, originalName: true, fileSize: true, fileType: true,
        subfolder: { select: { label: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    files = mediaFiles.map(f => ({
      id:         f.id,
      name:       f.originalName,
      size:       Number(f.fileSize),
      sizeLabel:  fmtSize(Number(f.fileSize)),
      mimeType:   f.fileType,
      folderPath: f.subfolder?.label ?? null,
      canPreview: f.fileType === 'PHOTO',
    }))
  } else if (link.linkType === 'TRANSFER' && link.transferId) {
    const txFiles = await prisma.transferFile.findMany({
      where:   { transferId: link.transferId },
      select:  { id: true, originalName: true, fileSize: true, mimeType: true, folderPath: true },
      orderBy: { createdAt: 'asc' },
    })
    files = txFiles.map(f => ({
      id:         f.id,
      name:       f.originalName,
      size:       Number(f.fileSize),
      sizeLabel:  fmtSize(Number(f.fileSize)),
      mimeType:   f.mimeType,
      folderPath: f.folderPath ?? null,
      canPreview: /\.(jpe?g|png|gif|webp|svg)$/i.test(f.originalName),
    }))
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  return NextResponse.json({
    id:          link.id,
    title:       link.title,
    message:     link.message,
    linkType:    link.linkType,
    senderName,
    adminEmail,
    expiresAt:   link.expiresAt.toISOString(),
    files,
    totalFiles:  files.length,
    totalSize,
    totalSizeLabel: fmtSize(totalSize),
  })
}

/**
 * DELETE /api/share/[token]
 * Revoke a share link.
 * Access: original creator or ADMIN.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // This is an authenticated action — import session check
  const { getServerSession } = await import('next-auth')
  const { authOptions }      = await import('@/lib/auth')
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const link = await prisma.shareLink.findUnique({ where: { token } })
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = link.createdById === session.user.id
  const isAdmin = session.user.role === 'ADMIN'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.shareLink.update({ where: { id: link.id }, data: { isRevoked: true } })

  const { log } = await import('@/lib/activityLog')
  log('SHARE_LINK_REVOKED', session.user.id, {
    metadata: { shareLinkId: link.id, title: link.title },
  }).catch((e: unknown) => console.warn('[share] revoke log failed:', e))

  return NextResponse.json({ ok: true })
}
