import { redirect }            from 'next/navigation'
import Link                    from 'next/link'
import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { prisma }              from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { SearchFilters, FilterOptions } from '@/components/SearchFilters'
import { Prisma }              from '@prisma/client'
import {
  Search, Image as ImageIcon, Video, ChevronRight, FileQuestion,
} from 'lucide-react'

// ── Status display helpers ────────────────────────────────────────────────────
const STATUS_PILL: Record<string, string> = {
  RAW:                  'bg-slate-700 text-slate-300',
  EDITING_IN_PROGRESS:  'bg-yellow-800/60 text-yellow-300',
  EDITED:               'bg-blue-800/60 text-blue-300',
  PUBLISHED:            'bg-green-800/60 text-green-300',
  ARCHIVED:             'bg-amber-800/60 text-amber-300',
  DELETED:              'bg-red-900/60 text-red-400',
  PURGED:               'bg-rose-950 text-rose-500',
}
const STATUS_LABEL: Record<string, string> = {
  RAW: 'Raw', EDITING_IN_PROGRESS: 'Editing', EDITED: 'Edited',
  PUBLISHED: 'Published', ARCHIVED: 'Archived', DELETED: 'Deleted', PURGED: 'Purged',
}

function fmtBytes(bytes: string) {
  const n = Number(bytes)
  if (n < 1024)         return `${n} B`
  if (n < 1024 ** 2)    return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)    return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface PageProps {
  searchParams: {
    q?: string; year?: string; categoryId?: string; eventId?: string
    fileType?: string; uploaderId?: string; status?: string; tags?: string
    dateFrom?: string; dateTo?: string; sort?: string; page?: string
  }
}

const VALID_FILE_TYPE = ['PHOTO', 'VIDEO'] as const
const VALID_SORT      = ['newest', 'oldest', 'name', 'size'] as const
const VALID_STATUS    = ['RAW','EDITING_IN_PROGRESS','EDITED','PUBLISHED','ARCHIVED','DELETED'] as const
const LIMIT = 24

export default async function SearchPage({ searchParams: sp }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const isAdmin = session.user.role === 'ADMIN'

  // ── Parse params ─────────────────────────────────────────────────────────
  const q           = sp.q?.trim() ?? ''
  const year        = sp.year ? parseInt(sp.year, 10) : null
  const catId       = sp.categoryId ?? null
  const eventId     = sp.eventId    ?? null
  const fileType    = VALID_FILE_TYPE.includes(sp.fileType as any)
    ? (sp.fileType as 'PHOTO' | 'VIDEO') : null
  const uploaderIds = (sp.uploaderId?.split(',').filter(Boolean) ?? [])
  const statuses    = (sp.status?.split(',').filter(Boolean) ?? [])
    .filter(s => VALID_STATUS.includes(s as any))
  const tags        = sp.tags?.split(',').filter(Boolean) ?? []
  const dateFrom    = sp.dateFrom ?? null
  const dateTo      = sp.dateTo   ?? null
  const sort        = VALID_SORT.includes(sp.sort as any) ? sp.sort! : 'newest'
  const page        = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const hasFilters = !!(q || year || catId || eventId || fileType ||
    uploaderIds.length || statuses.length || tags.length || dateFrom || dateTo)

  // ── Fetch filter options (for SearchFilters panel) ────────────────────────
  const [years, categories, tagOptions, users] = await Promise.all([
    prisma.year.findMany({ orderBy: { year: 'desc' } }),
    prisma.eventCategory.findMany({ include: { year: true }, orderBy: { name: 'asc' } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    isAdmin
      ? prisma.user.findMany({ select: { id: true, username: true, email: true }, orderBy: { username: 'asc' } })
      : Promise.resolve([] as { id: string; username: string | null; email: string }[]),
  ])

  const filterOptions: FilterOptions = { years, categories, tags: tagOptions, users }

  // ── Build search WHERE ────────────────────────────────────────────────────
  let results: Awaited<ReturnType<typeof runSearch>> = { files: [], total: 0 }
  if (hasFilters) {
    results = await runSearch({
      q, year, catId, eventId, fileType, uploaderIds, statuses, tags, dateFrom, dateTo, sort, page, isAdmin,
    })
  }

  const { files, total } = results
  const totalPages = Math.ceil(total / LIMIT)

  // ── Build canonical URL for pagination links ──────────────────────────────
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (q)                   params.set('q', q)
    if (year)                params.set('year', String(year))
    if (catId)               params.set('categoryId', catId)
    if (eventId)             params.set('eventId', eventId)
    if (fileType)            params.set('fileType', fileType)
    if (uploaderIds.length)  params.set('uploaderId', uploaderIds.join(','))
    if (statuses.length)     params.set('status', statuses.join(','))
    if (tags.length)         params.set('tags', tags.join(','))
    if (dateFrom)            params.set('dateFrom', dateFrom)
    if (dateTo)              params.set('dateTo', dateTo)
    params.set('sort', sort)
    params.set('page', String(p))
    return '/search?' + params.toString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Search className="w-6 h-6 text-indigo-400" />
          Search
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Search across all files, events, and tags in the system.
        </p>
      </div>

      {/* Filter panel */}
      <SearchFilters options={filterOptions} isAdmin={isAdmin} />

      {/* Results */}
      {!hasFilters ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-600">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Enter a keyword or apply filters to search.</p>
        </div>
      ) : (
        <>
          {/* Results meta */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {total === 0
                ? 'No results found'
                : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}${
                    totalPages > 1 ? ` — page ${page} of ${totalPages}` : ''
                  }`}
            </p>
          </div>

          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <FileQuestion className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No files match your search.</p>
            </div>
          ) : (
            <>
              {/* Results grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {files.map(f => (
                  <Link
                    key={f.id}
                    href={`/events/${f.breadcrumb.eventId}${f.breadcrumb.subfolderId ? `?subfolder=${f.breadcrumb.subfolderId}` : ''}`}
                    className="group relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800
                               hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/10"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-slate-800 relative overflow-hidden">
                      {f.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.thumbnailUrl}
                          alt={f.originalName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {f.fileType === 'VIDEO'
                            ? <Video className="w-10 h-10 text-slate-600" />
                            : <ImageIcon className="w-10 h-10 text-slate-600" />}
                        </div>
                      )}

                      {/* File type badge */}
                      <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px]
                        font-bold uppercase tracking-wide
                        ${f.fileType === 'VIDEO'
                          ? 'bg-violet-950/90 text-violet-300' : 'bg-slate-950/80 text-slate-300'}`}>
                        {f.fileType === 'VIDEO' ? 'VID' : 'IMG'}
                      </span>

                      {/* Status badge */}
                      <span className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px]
                        font-medium ${STATUS_PILL[f.status] ?? 'bg-slate-700 text-slate-300'}`}>
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="p-2.5 space-y-1.5">
                      <p className="text-xs font-medium text-slate-200 truncate" title={f.originalName}>
                        {f.originalName}
                      </p>

                      {/* Breadcrumb */}
                      <div className="flex items-center gap-0.5 text-[10px] text-slate-500 flex-wrap">
                        <span className="text-indigo-400 font-medium">{f.breadcrumb.year}</span>
                        <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-[60px]" title={f.breadcrumb.category}>
                          {f.breadcrumb.category}
                        </span>
                        <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-[60px]" title={f.breadcrumb.event}>
                          {f.breadcrumb.event}
                        </span>
                        {f.breadcrumb.subfolder && (
                          <>
                            <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate max-w-[50px]">{f.breadcrumb.subfolder}</span>
                          </>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center justify-between text-[10px] text-slate-600">
                        <span>{fmtBytes(f.fileSize)}</span>
                        <span>{new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  {page > 1 && (
                    <Link
                      href={pageUrl(page - 1)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition"
                    >
                      ← Previous
                    </Link>
                  )}

                  {/* Page numbers (show ±2 around current) */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<(number | '…')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={'ellipsis-' + i} className="text-slate-600 px-1">…</span>
                      ) : (
                        <Link
                          key={p}
                          href={pageUrl(p as number)}
                          className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition ${
                            p === page
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {p}
                        </Link>
                      )
                    )}

                  {page < totalPages && (
                    <Link
                      href={pageUrl(page + 1)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Query helper (separated for clarity) ─────────────────────────────────────
async function runSearch(opts: {
  q: string; year: number | null; catId: string | null; eventId: string | null
  fileType: 'PHOTO' | 'VIDEO' | null; uploaderIds: string[]; statuses: string[]
  tags: string[]; dateFrom: string | null; dateTo: string | null
  sort: string; page: number; isAdmin: boolean
}) {
  const and: Prisma.MediaFileWhereInput[] = [
    { status: { notIn: (opts.isAdmin ? ['PURGED'] : ['PURGED', 'DELETED']) as any[] } },
  ]

  if (opts.q) {
    and.push({
      OR: [
        { originalName: { contains: opts.q, mode: 'insensitive' } },
        { event: { name: { contains: opts.q, mode: 'insensitive' } } },
        { tags: { some: { name: { contains: opts.q, mode: 'insensitive' } } } },
      ],
    })
  }

  if (opts.eventId) {
    and.push({ eventId: opts.eventId })
  } else {
    const ef: Prisma.EventWhereInput = {}
    if (opts.year)  ef.category = { year: { year: opts.year } }
    if (opts.catId) ef.categoryId = opts.catId
    if (Object.keys(ef).length) and.push({ event: ef })
  }

  if (opts.fileType)           and.push({ fileType: opts.fileType })
  if (opts.uploaderIds.length) and.push({ uploaderId: { in: opts.uploaderIds } })
  if (opts.statuses.length)    and.push({ status: { in: opts.statuses as any[] } })
  if (opts.tags.length)        and.push({ tags: { some: { name: { in: opts.tags } } } })

  if (opts.dateFrom || opts.dateTo) {
    and.push({
      createdAt: {
        ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) }                   : {}),
        ...(opts.dateTo   ? { lte: new Date(opts.dateTo + 'T23:59:59.999Z') } : {}),
      },
    })
  }

  const where: Prisma.MediaFileWhereInput = { AND: and }

  let orderBy: Prisma.MediaFileOrderByWithRelationInput
  switch (opts.sort) {
    case 'oldest': orderBy = { createdAt: 'asc' };     break
    case 'name':   orderBy = { originalName: 'asc' };  break
    case 'size':   orderBy = { fileSize: 'desc' };     break
    default:       orderBy = { createdAt: 'desc' }
  }

  const [total, rawFiles] = await Promise.all([
    prisma.mediaFile.count({ where }),
    prisma.mediaFile.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * LIMIT,
      take: LIMIT,
      include: {
        event: {
          include: { category: { include: { year: true } } },
        },
        subfolder: { select: { id: true, label: true } },
        tags:      { orderBy: { name: 'asc' } },
      },
    }),
  ])

  const files = await Promise.all(
    rawFiles.map(async (m) => {
      const thumbnailUrl = m.thumbnailKey
        ? await getPresignedDownloadUrl(m.thumbnailKey)
        : null
      return {
        ...m,
        fileSize:    m.fileSize.toString(),
        thumbnailUrl,
        breadcrumb: {
          year:        m.event.category.year.year,
          category:    m.event.category.name,
          event:       m.event.name,
          eventId:     m.eventId,
          subfolder:   m.subfolder?.label  ?? null,
          subfolderId: m.subfolderId       ?? null,
        },
      }
    })
  )

  return { files, total }
}
