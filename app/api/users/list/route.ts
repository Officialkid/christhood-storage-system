import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/users/list
 * Any authenticated user can call this to get all users for the recipient picker.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, email: true, role: true },
    orderBy: [{ username: 'asc' }, { name: 'asc' }],
  })

  // Exclude the current user from the list (can't send to yourself)
  const filtered = users.filter(u => u.id !== session.user.id)

  return NextResponse.json({ users: filtered })
}
