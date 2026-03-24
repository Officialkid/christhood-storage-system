import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

/**
 * GET /api/media/[fileId]/tags
 * Returns the tags applied to a specific file.
 * Access: any authenticated user.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = await prisma.mediaFile.findUnique({
    where:   { id: params.fileId },
    include: { tags: { orderBy: { name: 'asc' } } },
  })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return NextResponse.json({ tags: file.tags })
}

/**
 * PUT /api/media/[fileId]/tags
 * Body: { tagIds: string[] }
 *
 * Replaces the complete set of tags on a file.
 * Passing an empty array removes all tags.
 * Access: EDITOR and ADMIN only.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string
  if (role === 'UPLOADER') {
    return NextResponse.json({ error: 'Forbidden: UPLOADERs cannot edit tags' }, { status: 403 })
  }

  const body    = await req.json().catch(() => ({}))
  const tagIds  = (body.tagIds as string[] | undefined) ?? []

  if (!Array.isArray(tagIds)) {
    return NextResponse.json({ error: 'tagIds must be an array' }, { status: 400 })
  }

  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Validate that all supplied IDs actually exist
  if (tagIds.length > 0) {
    const found = await prisma.tag.count({ where: { id: { in: tagIds } } })
    if (found !== tagIds.length) {
      return NextResponse.json({ error: 'One or more tag IDs are invalid' }, { status: 400 })
    }
  }

  // Disconnect all existing tags and connect new ones atomically
  const updated = await prisma.mediaFile.update({
    where: { id: params.fileId },
    data: {
      tags: {
        set: tagIds.map((id) => ({ id })),
      },
    },
    include: { tags: { orderBy: { name: 'asc' } } },
  })

  // Log — non-fatal
  await log('TAG_CHANGED', session.user.id, {
    mediaFileId: file.id,
    eventId: file.eventId,
    metadata: {
      fileName: file.originalName,
      tagIds,
      tagNames: updated.tags.map((t) => t.name),
    },
  })

  return NextResponse.json({ tags: updated.tags })
}
