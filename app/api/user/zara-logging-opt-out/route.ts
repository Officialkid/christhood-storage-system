import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

// GET  /api/user/zara-logging-opt-out  → { optOut: boolean }
export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where:  { id: token.id as string },
    select: { zaraLoggingOptOut: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ optOut: user.zaraLoggingOptOut })
}

// PATCH /api/user/zara-logging-opt-out  body: { optOut: boolean }
export async function PATCH(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body?.optOut !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body — optOut must be boolean' }, { status: 400 })
  }

  const userId = token.id as string

  // Update the preference
  await prisma.user.update({
    where: { id: userId },
    data:  { zaraLoggingOptOut: body.optOut },
  })

  // If opting OUT: immediately delete all previously-logged records for this user
  if (body.optOut) {
    const crypto = (await import('crypto')).default
    const anonymousId = crypto.createHash('sha256').update(userId).digest('hex')
    await prisma.zaraConversationLog.deleteMany({
      where: { anonymousUserId: anonymousId },
    })
  }

  return NextResponse.json({ success: true, optOut: body.optOut })
}
