import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/transfers/sent
 * Returns sent transfers for the current user (sender only).
 * Transfers are private — only the sender may list their own sent transfers.
 *   ADMIN, EDITOR — sees only transfers they personally sent
 *   UPLOADER — forbidden (403; uploaders cannot send transfers)
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role as string | undefined
  if (!session || !role || !(['ADMIN', 'EDITOR'] as string[]).includes(role)) {
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
      pin:      undefined, // never expose the bcrypt hash to the client
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
