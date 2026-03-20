import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import bcrypt                        from 'bcryptjs'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }           from '@/lib/activityLog'
import { logger }        from '@/lib/logger'

/**
 * POST /api/share
 * Creates a new external share link.
 * Access: ADMIN or EDITOR only.
 *
 * Body:
 *   linkType     "FILE" | "EVENT" | "TRANSFER"
 *   fileId?      string  (required when linkType = FILE)
 *   eventId?     string  (required when linkType = EVENT)
 *   subfolderId? string  (optional sub-scope for EVENT links)
 *   transferId?  string  (required when linkType = TRANSFER)
 *   title        string  (1–120 chars)
 *   message?     string  (optional, ≤500 chars)
 *   pin?         string  (4-digit numeric, optional)
 *   maxDownloads? number (positive int, optional)
 *   expiresInHours number (1–8760 — must be provided; max 1 year)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EDITOR') {
    return NextResponse.json({ error: 'Forbidden — Admin or Editor role required' }, { status: 403 })
  }

  let body: {
    linkType:       string
    fileId?:        string | null
    eventId?:       string | null
    subfolderId?:   string | null
    transferId?:    string | null
    title:          string
    message?:       string | null
    pin?:           string | null
    maxDownloads?:  number | null
    expiresInHours: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { linkType, fileId, eventId, subfolderId, transferId,
          title, message, pin, maxDownloads, expiresInHours } = body

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!['FILE', 'EVENT', 'TRANSFER'].includes(linkType)) {
    return NextResponse.json({ error: 'linkType must be FILE, EVENT, or TRANSFER' }, { status: 400 })
  }
  if (!title?.trim() || title.trim().length > 120) {
    return NextResponse.json({ error: 'title is required (max 120 characters)' }, { status: 400 })
  }
  if (message && message.length > 500) {
    return NextResponse.json({ error: 'message too long (max 500 characters)' }, { status: 400 })
  }
  if (typeof expiresInHours !== 'number' || expiresInHours < 1 || expiresInHours > 8760) {
    return NextResponse.json({ error: 'expiresInHours must be between 1 and 8760' }, { status: 400 })
  }
  if (pin != null && !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }
  if (maxDownloads != null && (!Number.isInteger(maxDownloads) || maxDownloads < 1)) {
    return NextResponse.json({ error: 'maxDownloads must be a positive integer' }, { status: 400 })
  }

  // ── Target existence checks ────────────────────────────────────────────────
  if (linkType === 'FILE') {
    if (!fileId) return NextResponse.json({ error: 'fileId required for FILE links' }, { status: 400 })
    const exists = await prisma.mediaFile.count({ where: { id: fileId } })
    if (!exists) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  } else if (linkType === 'EVENT') {
    if (!eventId) return NextResponse.json({ error: 'eventId required for EVENT links' }, { status: 400 })
    const exists = await prisma.event.count({ where: { id: eventId } })
    if (!exists) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (subfolderId) {
      const sfExists = await prisma.eventSubfolder.count({ where: { id: subfolderId, eventId } })
      if (!sfExists) return NextResponse.json({ error: 'Subfolder not found in this event' }, { status: 404 })
    }
  } else {
    // TRANSFER
    if (!transferId) return NextResponse.json({ error: 'transferId required for TRANSFER links' }, { status: 400 })
    const exists = await prisma.transfer.count({ where: { id: transferId } })
    if (!exists) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  }

  // ── PIN hashing ────────────────────────────────────────────────────────────
  const pinHash = pin ? await bcrypt.hash(pin, 10) : null

  // ── Create link ────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
  const link = await prisma.shareLink.create({
    data: {
      createdById:  session.user.id,
      linkType,
      fileId:       fileId   ?? null,
      eventId:      eventId  ?? null,
      subfolderId:  subfolderId ?? null,
      transferId:   transferId ?? null,
      title:        title.trim(),
      message:      message?.trim() || null,
      pinHash,
      maxDownloads: maxDownloads ?? null,
      expiresAt,
    },
  })

  log('SHARE_LINK_CREATED', session.user.id, {
    metadata: { shareLinkId: link.id, linkType, title: link.title, expiresAt: expiresAt.toISOString() },
  }).catch((e: unknown) => logger.warn('SHARE_SIDE_EFFECT_FAILED', { route: '/api/share', error: (e as Error)?.message, message: 'Activity log failed after share link creation' }))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return NextResponse.json({
    id:        link.id,
    token:     link.token,
    url:       `${appUrl}/share/${link.token}`,
    expiresAt: link.expiresAt.toISOString(),
    hasPin:    !!pin,
  }, { status: 201 })
}

/**
 * GET /api/share
 * List all share links created by the requesting admin/editor.
 * ADMIN sees all links; EDITOR sees only their own.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EDITOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where = session.user.role === 'ADMIN' ? {} : { createdById: session.user.id }

  const links = await prisma.shareLink.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, token: true, linkType: true, title: true,
      message: true, maxDownloads: true, downloadCount: true,
      expiresAt: true, isRevoked: true, createdAt: true,
      pinHash: true,
      createdBy: { select: { id: true, username: true, name: true } },
      _count: { select: { accesses: true } },
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return NextResponse.json({
    links: links.map(({ pinHash, _count, ...l }) => ({
      ...l,
      hasPin: !!pinHash,
      url:    `${appUrl}/share/${l.token}`,
      accessCount: _count.accesses,
    })),
  })
}
