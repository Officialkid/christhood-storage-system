import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/users/search?q=<query>
 * Any authenticated user. Returns up to 10 users matching the query by
 * name/username/email, excluding the current user.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ users: [] })

  const users = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },   // never return yourself
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { name:     { contains: q, mode: 'insensitive' } },
        { email:    { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, username: true, name: true, email: true, role: true },
    take: 10,
  })

  return NextResponse.json({ users })
}
