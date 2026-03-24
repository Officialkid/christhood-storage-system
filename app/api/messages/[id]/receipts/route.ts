import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

// Simple in-process cache: messageId → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 60_000

/**
 * GET /api/messages/[id]/receipts
 * Admin-only. Returns full read-receipt details for a sent message:
 * each recipient's name, role, read status, and readAt timestamp.
 * Cached per messageId for 60 seconds.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify the message belongs to this admin
  const message = await prisma.message.findUnique({
    where:  { id: params.id },
    select: { id: true, senderId: true, broadcastRole: true, subject: true },
  })

  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (message.senderId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check cache
  const now    = Date.now()
  const cached = cache.get(params.id)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data)
  }

  const rows = await prisma.messageRecipient.findMany({
    where:   { messageId: params.id },
    include: {
      recipient: {
        select: { id: true, name: true, username: true, email: true, role: true },
      },
    },
  })

  // Sort: read first (by readAt desc), then unread (by createdAt desc)
  rows.sort((a, b) => {
    if (a.read && !b.read) return -1
    if (!a.read && b.read) return  1
    if (a.read && b.read) {
      return (b.readAt?.getTime() ?? 0) - (a.readAt?.getTime() ?? 0)
    }
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const recipients = rows.map((r) => ({
    id:        r.recipient.id,
    name:      r.recipient.name,
    username:  r.recipient.username,
    email:     r.recipient.email,
    role:      r.recipient.role as string,
    read:      r.read,
    readAt:    r.readAt?.toISOString() ?? null,
  }))

  const readCount  = rows.filter((r) => r.read).length
  const totalCount = rows.length

  const data = {
    messageId:     params.id,
    subject:       message.subject,
    broadcastRole: message.broadcastRole,
    readCount,
    totalCount,
    recipients,
  }

  cache.set(params.id, { data, expiresAt: now + CACHE_TTL_MS })

  return NextResponse.json(data)
}
