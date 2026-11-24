import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EventsBrowserClient } from '@/components/EventsBrowserClient'
import type { HierarchyYear } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ category?: string }>
}

export default async function EventsPage(props: Props) {
  const searchParams = await props.searchParams
  const session = await getServerSession(authOptions)

  const yearsRaw = await prisma.year.findMany({
    orderBy: { year: 'desc' },
    include: {
      categories: {
        orderBy: { name: 'asc' },
        include: {
          events: {
            orderBy: [{ createdAt: 'desc' }],
            include: {
              subfolders: {
                orderBy: { label: 'asc' },
                include: {
                  _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
                },
              },
              _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
            },
          },
        },
      },
    },
  })

  const years: HierarchyYear[] = yearsRaw.map(y => ({
    id:        y.id,
    year:      y.year,
    createdAt: y.createdAt.toISOString(),
    categories: y.categories.map(c => ({
      id:         c.id,
      name:       c.name,
      yearId:     c.yearId,
      isDefault:  c.isDefault,
      isArchived: c.isArchived,
      events: c.events.map(e => ({
        id:         e.id,
        name:       e.name,
        date:       e.date ? e.date.toISOString() : null,
        categoryId: e.categoryId,
        createdAt:  e.createdAt.toISOString(),
        subfolders: e.subfolders,
        _count:     e._count,
      })),
    })),
  }))

  return (
    <div className="max-w-5xl">
      <EventsBrowserClient
        years={years}
        isAdmin={session?.user?.role === 'ADMIN'}
        initialCategory={searchParams.category}
      />
    </div>
  )
}
