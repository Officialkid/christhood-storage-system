import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

// POST /api/admin/categories/[id]/merge
// Body: { targetCategoryId: string }
// Moves all events from the source category ([id]) to the target, then archives the source.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' },       { status: 403 })

  const sourceId = params.id

  let body: { targetCategoryId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { targetCategoryId } = body
  if (!targetCategoryId || typeof targetCategoryId !== 'string') {
    return NextResponse.json({ error: 'targetCategoryId is required' }, { status: 422 })
  }

  if (sourceId === targetCategoryId) {
    return NextResponse.json({ error: 'Source and target must be different categories' }, { status: 422 })
  }

  const [source, target] = await Promise.all([
    prisma.eventCategory.findUnique({ where: { id: sourceId }, include: { year: true } }),
    prisma.eventCategory.findUnique({ where: { id: targetCategoryId }, include: { year: true } }),
  ])

  if (!source) return NextResponse.json({ error: 'Source category not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'Target category not found' }, { status: 404 })

  if (target.isArchived) {
    return NextResponse.json(
      { error: 'Cannot merge into an archived category. Unarchive it first.' },
      { status: 409 },
    )
  }

  // Move all events from source → target
  const { count } = await prisma.event.updateMany({
    where: { categoryId: sourceId },
    data:  { categoryId: targetCategoryId },
  })

  // Archive the (now-empty) source category
  await prisma.eventCategory.update({
    where: { id: sourceId },
    data:  { isArchived: true },
  })

  await log('CATEGORY_UPDATED', session.user.id, {
    metadata: {
      sourceId,
      sourceName:   source.name,
      targetId:     targetCategoryId,
      targetName:   target.name,
      year:         source.year.year,
      eventsmoved:  count,
      action:       'merge',
    },
  })

  return NextResponse.json({
    message:      `Merged ${count} event(s) into "${target.name}" and archived "${source.name}".`,
    eventsMovedCount: count,
  })
}
