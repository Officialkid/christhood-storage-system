import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/transfers/sent
 * Returns sent transfers for the current user.
 *   ADMIN  — sees every transfer in the system (for auditing)
 *   EDITOR — sees only transfers they sent
 *   UPLOADER — forbidden (403)
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  if (!session || !role || !(['ADMIN', 'EDITOR'] as string[]).includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Admins see all sent transfers; Editors see only their own
  const sentWhere = role === 'ADMIN' ? {} : { senderId: session.user.id }

  const transfers = await prisma.transfer.findMany({
    where:   sentWhere,
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
