import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'

// PATCH /api/admin/categories/[id]
// Body:  { name?: string }    → rename
//        { isArchived?: boolean } → archive / unarchive
// Cannot rename or archive the 7 official default categories (isDefault === true).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user)                return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' },       { status: 403 })

  const { id } = params

  const category = await prisma.eventCategory.findUnique({
    where:   { id },
    include: { year: true },
  })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  let body: { name?: string; isArchived?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed)         return NextResponse.json({ error: 'Name cannot be empty' },      { status: 422 })
    if (trimmed.length > 80) return NextResponse.json({ error: 'Name too long (max 80)' }, { status: 422 })

    // Official categories cannot be renamed
    if (category.isDefault) {
      return NextResponse.json(
        { error: 'Official categories cannot be renamed.' },
        { status: 409 },
      )
    }

    // Check for name conflict in the same year
    const conflict = await prisma.eventCategory.findFirst({
      where: { yearId: category.yearId, name: trimmed, id: { not: id } },
    })
    if (conflict) {
      return NextResponse.json(
        { error: `A category named "${trimmed}" already exists in ${category.year.year}.` },
        { status: 409 },
      )
    }

    const updated = await prisma.eventCategory.update({
      where: { id },
      data:  { name: trimmed },
    })

    await log('CATEGORY_UPDATED', session.user.id, {
      metadata: {
        categoryId: id,
        oldName:    category.name,
        newName:    trimmed,
        year:       category.year.year,
        action:     'rename',
      },
    })

    return NextResponse.json({ category: updated })
  }

  // ── Archive / Unarchive ───────────────────────────────────────────────────
  if (typeof body.isArchived === 'boolean') {
    if (category.isDefault && body.isArchived) {
      return NextResponse.json(
        { error: 'Official categories cannot be archived.' },
        { status: 409 },
      )
    }

    const updated = await prisma.eventCategory.update({
      where: { id },
      data:  { isArchived: body.isArchived },
    })

    await log('CATEGORY_UPDATED', session.user.id, {
      metadata: {
        categoryId: id,
        name:       category.name,
        year:       category.year.year,
        action:     body.isArchived ? 'archive' : 'unarchive',
      },
    })

    return NextResponse.json({ category: updated })
  }

  return NextResponse.json({ error: 'Provide name or isArchived to update' }, { status: 422 })
}
