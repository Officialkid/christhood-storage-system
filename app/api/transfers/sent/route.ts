import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/transfers/sent
 * Admin-only. Returns all transfers sent by the current admin, newest-first,
 * including recipient info and response summary.
 * Provides a client-fetchable equivalent of the server-rendered sent transfers page.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const transfers = await prisma.transfer.findMany({
    where:   { senderId: session.user.id },
    include: {
      recipient: { select: { id: true, username: true, name: true, email: true, role: true } },
      response:  {
        select: {
          id:                true,
          downloadedByAdmin: true,
          totalFiles:        true,
          totalSize:         true,
          createdAt:         true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      ...t,
      totalSize: Number(t.totalSize),
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      response:  t.response
        ? {
            ...t.response,
            totalSize: Number(t.response.totalSize),
            createdAt: t.response.createdAt.toISOString(),
          }
        : null,
    })),
  })
}
