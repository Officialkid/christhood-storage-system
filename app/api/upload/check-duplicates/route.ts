import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * POST /api/upload/check-duplicates
 *
 * Pre-upload duplicate check. Given a list of filenames + sizes and an eventId,
 * returns which files already exist in that event (active / non-deleted only).
 *
 * Body:
 *   { eventId: string, files: { name: string, size: number }[] }
 *
 * Response:
 *   { results: {
 *       name:      string
 *       size:      number
 *       duplicate: {
 *         id:           string
 *         originalName: string
 *         storedName:   string
 *         fileSize:     string     // BigInt serialised as string
 *         uploadedAt:   string     // ISO date
 *         uploaderName: string
 *       } | null
 *     }[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    eventId?: string
    files?:   { name: string; size: number }[]
  }

  const { eventId, files } = body
  if (!eventId || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const names = [...new Set(files.map(f => f.name))]

  // One query — grab all active files in this event whose name is in the list
  const existing = await prisma.mediaFile.findMany({
    where: {
      eventId,
      originalName: { in: names },
      status: { notIn: ['DELETED', 'PURGED'] },
    },
    select: {
      id:          true,
      originalName: true,
      storedName:  true,
      fileSize:    true,
      createdAt:   true,
      uploader:    { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Build a map of name → most-recent match (already desc-ordered)
  const matchMap = new Map<string, typeof existing[number]>()
  for (const row of existing) {
    if (!matchMap.has(row.originalName)) {
      matchMap.set(row.originalName, row)
    }
  }

  const results = files.map(f => {
    const match = matchMap.get(f.name) ?? null
    return {
      name:      f.name,
      size:      f.size,
      duplicate: match
        ? {
            id:           match.id,
            originalName: match.originalName,
            storedName:   match.storedName,
            fileSize:     match.fileSize.toString(),
            uploadedAt:   match.createdAt.toISOString(),
            uploaderName: match.uploader?.name ?? 'Unknown',
          }
        : null,
    }
  })

  return NextResponse.json({ results })
}
