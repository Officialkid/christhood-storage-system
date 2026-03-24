import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/transfers/inbox
 * Returns the current user's received transfers, newest-first.
 * Provides a client-fetchable equivalent of the server-rendered transfer inbox page.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const transfers = await prisma.transfer.findMany({
    where:   { recipientId: session.user.id },
    include: {
      sender: { select: { id: true, username: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      ...t,
      pin:       undefined, // never expose the bcrypt hash to the client
      totalSize: Number(t.totalSize),
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
    })),
  })
}
