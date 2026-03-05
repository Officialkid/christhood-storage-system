import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { getPresignedDownloadUrl }   from '@/lib/r2'
import { Prisma }                    from '@prisma/client'

const VALID_SORT       = ['newest', 'oldest', 'name', 'size'] as const
const VALID_STATUS     = ['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED', 'DELETED'] as const
const VALID_FILE_TYPE  = ['PHOTO', 'VIDEO'] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  const q           = sp.get('q')?.trim() ?? ''
  const year        = sp.get('year') ? parseInt(sp.get('year')!, 10) : null
  const catId       = sp.get('categoryId') ?? null
  const eventId     = sp.get('eventId') ?? null
  const fileType    = VALID_FILE_TYPE.includes(sp.get('fileType') as any)
    ? (sp.get('fileType') as 'PHOTO' | 'VIDEO')
    : null
  const uploaderIds = sp.get('uploaderId')?.split(',').filter(Boolean) ?? []
  const statuses    = (sp.get('status')?.split(',').filter(Boolean) ?? [])
    .filter(s => VALID_STATUS.includes(s as any))
  const tags        = sp.get('tags')?.split(',').filter(Boolean) ?? []
  const dateFrom    = sp.get('dateFrom') ?? null
  const dateTo      = sp.get('dateTo') ?? null
  const sort        = VALID_SORT.includes(sp.get('sort') as any) ? sp.get('sort')! : 'newest'
  const page        = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit       = Math.min(50, parseInt(sp.get('limit') ?? '24', 10) || 24)

  const isAdmin = session.user.role === 'ADMIN'

  // ── Build dynamic AND conditions ─────────────────────────────────────────
  const and: Prisma.MediaFileWhereInput[] = [
    { status: { notIn: (isAdmin ? ['PURGED'] : ['PURGED', 'DELETED']) as any[] } },
  ]

  if (q) {
    and.push({
      OR: [
        { originalName: { contains: q, mode: 'insensitive' } },
        { event: { name: { contains: q, mode: 'insensitive' } } },
        { tags: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ],
    })
  }

  // Event hierarchy (year → category → event)
  if (eventId) {
    and.push({ eventId })
  } else {
    const eventFilter: Prisma.EventWhereInput = {}
    if (year)  eventFilter.category = { year: { year } }
    if (catId) eventFilter.categoryId = catId
    if (Object.keys(eventFilter).length) and.push({ event: eventFilter })
  }

  if (fileType)           and.push({ fileType })
  if (uploaderIds.length) and.push({ uploaderId: { in: uploaderIds } })
  if (statuses.length)    and.push({ status: { in: statuses as any[] } })
  if (tags.length)        and.push({ tags: { some: { name: { in: tags } } } })

  if (dateFrom || dateTo) {
    and.push({
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom)                        } : {}),
        ...(dateTo   ? { lte: new Date(dateTo + 'T23:59:59.999Z')      } : {}),
      },
    })
  }

  const where: Prisma.MediaFileWhereInput = { AND: and }

  // ── Sort ─────────────────────────────────────────────────────────────────
  let orderBy: Prisma.MediaFileOrderByWithRelationInput
  switch (sort) {
    case 'oldest': orderBy = { createdAt: 'asc'      }; break
    case 'name':   orderBy = { originalName: 'asc'   }; break
    case 'size':   orderBy = { fileSize: 'desc'      }; break
    default:       orderBy = { createdAt: 'desc'     }
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  const [total, files] = await Promise.all([
    prisma.mediaFile.count({ where }),
    prisma.mediaFile.findMany({
      where,
      orderBy,
      skip:  (page - 1) * limit,
      take:  limit,
      include: {
        uploader: { select: { id: true, username: true, email: true } },
        event: {
          include: {
            category: { include: { year: true } },
          },
        },
        subfolder: { select: { id: true, label: true } },
        tags:      { orderBy: { name: 'asc' } },
      },
    }),
  ])

  // ── Enrich with presigned URLs + breadcrumb ───────────────────────────────
  const enriched = await Promise.all(
    files.map(async (m) => {
      const [downloadUrl, thumbnailUrl] = await Promise.all([
        getPresignedDownloadUrl(m.r2Key),
        m.thumbnailKey ? getPresignedDownloadUrl(m.thumbnailKey) : Promise.resolve(null),
      ])
      return {
        ...m,
        fileSize:     m.fileSize.toString(),
        downloadUrl,
        thumbnailUrl,
        breadcrumb: {
          year:        m.event.category.year.year,
          category:    m.event.category.name,
          categoryId:  m.event.categoryId,
          event:       m.event.name,
          eventId:     m.eventId,
          subfolder:   m.subfolder?.label  ?? null,
          subfolderId: m.subfolderId       ?? null,
        },
      }
    })
  )

  return NextResponse.json({
    files:      enriched,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  })
}
