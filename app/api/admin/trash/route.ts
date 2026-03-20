import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// GET /api/admin/trash
// ADMIN only — paginated list of all files currently in Trash
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden'       }, { status: 403 })

  const { searchParams } = req.nextUrl
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const skip  = (page - 1) * limit

  try {
    const [items, total] = await Promise.all([
      prisma.trashItem.findMany({
        skip,
        take:    limit,
        orderBy: { scheduledPurgeAt: 'asc' }, // soonest to expire first
        include: {
          deletedBy: { select: { id: true, username: true, email: true } },
          mediaFile: {
            select: {
              id:           true,
              originalName: true,
              storedName:   true,
              fileType:     true,
              fileSize:     true, // BigInt — serialised to string below
              status:       true,
              createdAt:    true,
              event:     { select: { id: true, name: true } },
              subfolder: { select: { id: true, label: true } },
            },
          },
        },
      }),
      prisma.trashItem.count(),
    ])

    // Serialise BigInt fileSize to string (JSON.stringify cannot handle BigInt natively)
    const serializedItems = items.map(item => ({
      ...item,
      mediaFile: item.mediaFile
        ? { ...item.mediaFile, fileSize: item.mediaFile.fileSize.toString() }
        : null,
    }))

    return NextResponse.json({
      items: serializedItems,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    logger.error('TRASH_QUERY_FAILED', { route: '/api/admin/trash', error: (err as Error)?.message, errorCode: (err as any)?.code, message: 'Failed to load trash' })
    return NextResponse.json(
      { error: 'Failed to load trash. Please try again.' },
      { status: 500 },
    )
  }
}
