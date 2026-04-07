import { prisma }        from '@/lib/prisma'
import { MediaGrid }     from '@/components/MediaGrid'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { TagPill }       from '@/components/TagPill'

// Statuses that appear in the filter bar (excludes DELETED / PURGED — those live in Trash)
const FILTER_STATUSES = [
  { value: 'RAW',                 label: 'Raw'       },
  { value: 'EDITING_IN_PROGRESS', label: 'Editing'   },
  { value: 'EDITED',              label: 'Edited'    },
  { value: 'PUBLISHED',           label: 'Published' },
  { value: 'ARCHIVED',            label: 'Archived'  },
] as const

export default async function MediaPage(
  props: {
    searchParams: Promise<{ page?: string; type?: string; eventId?: string; status?: string; tags?: string; sort?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const page     = Math.max(1, parseInt(searchParams.page ?? '1'))
  const limit    = 24
  const type     = searchParams.type    as any ?? undefined
  const eventId  = searchParams.eventId ?? undefined
  const status   = searchParams.status  ?? undefined
  const sort     = searchParams.sort    ?? 'newest'
  // tags param is comma-separated tag IDs: ?tags=id1,id2
  const tagIds   = searchParams.tags
    ? searchParams.tags.split(',').filter(Boolean)
    : []

  const whereStatus = status
    ? { status: status as any }
    : { status: { notIn: ['DELETED', 'PURGED'] as any[] } }

  const whereBase = {
    ...whereStatus,
    ...(type    ? { fileType: type as 'PHOTO' | 'VIDEO' } : {}),
    ...(eventId ? { eventId }                             : {}),
    // OR filter: files that have ANY of the selected tags
    ...(tagIds.length > 0
      ? { tags: { some: { id: { in: tagIds } } } }
      : {}),
  }

  const [items, total, events, allTags] = await Promise.all([
    prisma.mediaFile.findMany({
      where:   whereBase,
      include: {
        uploader: { select: { id: true, username: true, email: true } },
        event:    { select: { id: true, name: true } },
        tags:     { orderBy: { name: 'asc' } },
      },
      orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.mediaFile.count({ where: whereBase }),
    prisma.event.findMany({ select: { id: true, name: true }, orderBy: { date: 'desc' } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' } }),
  ])

  const enriched = await Promise.all(
    items.map(async (m) => {
      const [downloadUrl, thumbnailUrl] = await Promise.all([
        getPresignedDownloadUrl(m.r2Key),
        m.thumbnailKey ? getPresignedDownloadUrl(m.thumbnailKey) : Promise.resolve(null),
      ])
      return {
        ...m,
        fileSize:     m.fileSize.toString(),
        thumbnailKey: m.thumbnailKey ?? null,
        downloadUrl,
        thumbnailUrl,
      }
    })
  )

  const totalPages = Math.ceil(total / limit)

  /** Build a query string preserving the other active filters */
  function qs(overrides: Record<string, string | undefined>) {
    const params: Record<string, string> = {}
    if (type)           params.type    = type
    if (eventId)        params.eventId = eventId
    if (status)         params.status  = status
    if (sort !== 'newest') params.sort = sort
    if (tagIds.length)  params.tags    = tagIds.join(',')
    Object.assign(params, overrides)
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    )
    const str = new URLSearchParams(clean as Record<string, string>).toString()
    return str ? `?${str}` : ''
  }

  /** Toggle a tag ID in the active tag filter set */
  function tagsQs(tagId: string) {
    const next = tagIds.includes(tagId)
      ? tagIds.filter((id) => id !== tagId)
      : [...tagIds, tagId]
    return qs({ tags: next.join(',') || undefined, page: undefined })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Media Library</h1>
          <p className="mt-1 text-slate-400">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        {/* Sort toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sort:</span>
          <a
            href={qs({ sort: undefined, page: undefined })}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
              ${sort !== 'oldest' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Newest first
          </a>
          <a
            href={qs({ sort: 'oldest', page: undefined })}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
              ${sort === 'oldest' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Oldest first
          </a>
        </div>
      </div>

      {/* ── Status + type filter bar ── */}
      <div className="flex flex-wrap gap-2">
        <a
          href={qs({ status: undefined, page: undefined })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
            ${!status ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
        >
          All
        </a>

        {FILTER_STATUSES.map(({ value, label }) => {
          const active = status === value
          return (
            <a
              key={value}
              href={qs({ status: value, page: undefined })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
                ${active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {label}
            </a>
          )
        })}

        <span className="self-center text-slate-700">|</span>

        {(['PHOTO', 'VIDEO'] as const).map((t) => {
          const active = type === t
          return (
            <a
              key={t}
              href={qs({ type: active ? undefined : t, page: undefined })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
                ${active ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {t === 'PHOTO' ? '📷 Photos' : '🎬 Videos'}
            </a>
          )
        })}
      </div>

      {/* ── Tag filter bar ── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tags
          </span>
          {tagIds.length > 0 && (
            <a
              href={qs({ tags: undefined, page: undefined })}
              className="rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-800
                         text-slate-400 hover:text-slate-200 transition-colors"
            >
              Clear ×
            </a>
          )}
          {allTags.map((tag) => {
            const active = tagIds.includes(tag.id)
            return (
              <a key={tag.id} href={tagsQs(tag.id)}>
                <TagPill name={tag.name} active={active} size="md" />
              </a>
            )
          })}
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <span className="text-5xl mb-4">📂</span>
          <p>
            No media found
            {status   ? ` with status "${status}"`              : ''}
            {tagIds.length > 0 ? ' matching the selected tags'  : ''}.
          </p>
        </div>
      ) : (
        <MediaGrid files={enriched as any} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center pt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={qs({ page: String(p) })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${p === page
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
