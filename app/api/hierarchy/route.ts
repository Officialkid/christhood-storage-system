import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/hierarchy
 * Returns the full Year → Category → Event → Subfolder tree.
 * Available to any authenticated user for browsing.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const years = await prisma.year.findMany({
    orderBy: { year: 'desc' },
    include: {
      categories: {
        orderBy: { name: 'asc' },
        include: {
          events: {
            orderBy: { date: 'desc' },
            include: {
              subfolders: {
                orderBy: { label: 'asc' },
                include: { _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } } },
              },
              _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({ years })
}
