import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

// GET /api/admin/categories
// Query params: ?includeArchived=true  (default: false — only active categories)
// Returns all EventCategory rows with year, event count, and creator info.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' },       { status: 403 })

  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === 'true'

  const categories = await prisma.eventCategory.findMany({
    where: includeArchived ? undefined : { isArchived: false },
    include: {
      year:          { select: { id: true, year: true } },
      createdByUser: { select: { id: true, username: true, email: true } },
      _count:        { select: { events: true } },
    },
    orderBy: [
      { year:      { year: 'desc' } },
      { isDefault: 'desc'          },
      { name:      'asc'           },
    ],
  })

  return NextResponse.json({ categories })
}
