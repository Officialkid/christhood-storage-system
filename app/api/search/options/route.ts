import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

/** Returns all distinct option lists used to populate the filter panel dropdowns. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = session.user.role === 'ADMIN'

  const [years, categories, tags, users] = await Promise.all([
    prisma.year.findMany({ orderBy: { year: 'desc' } }),
    prisma.eventCategory.findMany({
      include: { year: true },
      orderBy: { name: 'asc' },
    }),
    prisma.tag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    isAdmin
      ? prisma.user.findMany({
          select:  { id: true, username: true, email: true },
          orderBy: { username: 'asc' },
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({ years, categories, tags, users })
}
