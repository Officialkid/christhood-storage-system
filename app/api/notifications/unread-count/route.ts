import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/** GET /api/notifications/unread-count — lightweight count for the bell badge */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ count: 0 })

  const count = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  })

  return NextResponse.json({ count })
}
