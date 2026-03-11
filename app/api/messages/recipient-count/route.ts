import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/messages/recipient-count?role=UPLOADER|EDITOR|ALL
 * Returns the number of users who would receive a broadcast message.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const role = req.nextUrl.searchParams.get('role')

  let count: number
  if (role === 'ALL') {
    count = await prisma.user.count({ where: { id: { not: session.user.id } } })
  } else if (role === 'UPLOADER' || role === 'EDITOR') {
    count = await prisma.user.count({ where: { role } })
  } else {
    return NextResponse.json({ error: 'Invalid role. Must be UPLOADER, EDITOR, or ALL.' }, { status: 400 })
  }

  return NextResponse.json({ count })
}
