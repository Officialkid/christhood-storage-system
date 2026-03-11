import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import { deliverMessage }            from '@/lib/messageDelivery'

/**
 * POST /api/messages
 * Admin-only. Creates a Message record + MessageRecipient rows,
 * fires in-app / push notifications, and (for URGENT) sends email immediately.
 *
 * Body shape:
 * {
 *   subject:              string              (max 150)
 *   body:                 string              (max 2000)
 *   priority:             'NORMAL' | 'URGENT'
 *   broadcastRole?:       'UPLOADER' | 'EDITOR' | 'ALL'
 *   recipientIds?:        string[]            (mutually exclusive with broadcastRole)
 *   attachmentTransferId?: string
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await req.json()
  const {
    subject,
    body: msgBody,
    priority,
    broadcastRole,
    recipientIds,
    attachmentTransferId,
  } = data as {
    subject:               string
    body:                  string
    priority:              string
    broadcastRole?:        string
    recipientIds?:         string[]
    attachmentTransferId?: string
  }

  // ── Validation ──────────────────────────────────────────────────────────
  if (!subject?.trim() || subject.trim().length > 150) {
    return NextResponse.json({ error: 'Subject is required (max 150 chars)' }, { status: 400 })
  }
  if (!msgBody?.trim() || msgBody.trim().length > 2000) {
    return NextResponse.json({ error: 'Message body is required (max 2000 chars)' }, { status: 400 })
  }
  const isValidPriority = priority === 'NORMAL' || priority === 'URGENT'
  const resolvedPriority = isValidPriority ? (priority as 'NORMAL' | 'URGENT') : 'NORMAL'

  const hasBroadcast = typeof broadcastRole === 'string' && broadcastRole.length > 0
  const hasRecipients = Array.isArray(recipientIds) && recipientIds.length > 0
  if (!hasBroadcast && !hasRecipients) {
    return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
  }

  // ── Resolve target user IDs ──────────────────────────────────────────────
  let targetUserIds: string[] = []

  if (hasBroadcast) {
    if (broadcastRole === 'ALL') {
      const users = await prisma.user.findMany({
        where:  { id: { not: session.user.id } },
        select: { id: true },
      })
      targetUserIds = users.map((u) => u.id)
    } else if (broadcastRole === 'UPLOADER' || broadcastRole === 'EDITOR') {
      const users = await prisma.user.findMany({
        where:  { role: broadcastRole },
        select: { id: true },
      })
      targetUserIds = users.map((u) => u.id)
    } else {
      return NextResponse.json({ error: 'Invalid broadcastRole' }, { status: 400 })
    }
  } else {
    // Verify all supplied IDs exist
    const found = await prisma.user.findMany({
      where:  { id: { in: recipientIds } },
      select: { id: true },
    })
    targetUserIds = found.map((u) => u.id)
  }

  if (targetUserIds.length === 0) {
    return NextResponse.json({ error: 'No matching recipients found' }, { status: 400 })
  }

  // ── Validate transfer attachment ─────────────────────────────────────────
  if (attachmentTransferId) {
    const t = await prisma.transfer.findUnique({
      where:  { id: attachmentTransferId },
      select: { id: true, senderId: true },
    })
    if (!t || t.senderId !== session.user.id) {
      return NextResponse.json({ error: 'Transfer not found or access denied' }, { status: 404 })
    }
  }

  // ── Create Message + recipients in one transaction ───────────────────────
  const message = await prisma.message.create({
    data: {
      senderId:             session.user.id,
      subject:              subject.trim(),
      body:                 msgBody.trim(),
      priority:             resolvedPriority,
      broadcastRole:        broadcastRole ?? null,
      attachmentTransferId: attachmentTransferId ?? null,
      recipients: {
        create: targetUserIds.map((uid) => ({ recipientId: uid })),
      },
    },
  })

  // ── Activity log ─────────────────────────────────────────────────────────
  void log('MESSAGE_SENT', session.user.id, {
    metadata: {
      messageId:      message.id,
      subject:        subject.trim(),
      priority:       resolvedPriority,
      recipientCount: targetUserIds.length,
      broadcastRole:  broadcastRole ?? null,
    },
  })

  // ── Delivery: push + email per recipient preferences (fire-and-forget) ───
  void deliverMessage(message.id)

  return NextResponse.json({ id: message.id, recipientCount: targetUserIds.length })
}
