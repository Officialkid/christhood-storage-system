import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/messages/transfers?q=
 * Admin-only. Returns the admin's sent transfers (for the compose attachment picker).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  const transfers = await prisma.transfer.findMany({
    where: {
      senderId: session.user.id,
      ...(q ? { subject: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: {
      id:         true,
      subject:    true,
      totalFiles: true,
      status:     true,
      createdAt:  true,
      recipient:  { select: { username: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    25,
  })

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  })
}
