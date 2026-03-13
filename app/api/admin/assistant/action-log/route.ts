// app/api/admin/assistant/action-log/route.ts
//
// GET /api/admin/assistant/action-log
//   Returns the last 50 ZaraActionLog entries, newest first.
//   Admin-only.

import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token || token.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const logs = await prisma.zaraActionLog.findMany({
    take:    50,
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: {
        select: { id: true, name: true, username: true },
      },
    },
  })

  return NextResponse.json({ logs })
}
