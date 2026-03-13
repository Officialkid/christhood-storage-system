import { notFound }            from 'next/navigation'
import Link                    from 'next/link'
import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { prisma }              from '@/lib/prisma'
import { Breadcrumb }          from '@/components/Breadcrumb'
import { MediaCard }           from '@/components/MediaCard'
import { BatchDownloadButton } from '@/components/BatchDownloadButton'
import { ArchiveSection }      from '@/components/ArchiveSection'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { canBatchDownload }    from '@/lib/downloadAuth'
import { CalendarDays, FolderOpen, Image, Upload } from 'lucide-react'
import ShareButton             from '@/components/ShareButton'

interface Props {
  params:      { eventId: string }
  searchParams: { subfolder?: string }
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { eventId }    = params
  const subfolderId    = searchParams.subfolder

  const session = await getServerSession(authOptions)
  const showBatch = session?.user?.role ? canBatchDownload(session.user.role) : false

  // Fetch event + context for breadcrumb
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      category:  { include: { year: true } },
      subfolders: { orderBy: { label: 'asc' } },
      _count:    { select: { mediaFiles: true } },
    },
  })

  if (!event) notFound()

  const isAdmin = session?.user?.role === 'ADMIN'

  // Fetch active + archived media separately
  const [activeFiles, archivedFiles] = await Promise.all([
    prisma.mediaFile.findMany({
      where: {
        eventId,
        subfolderId: subfolderId ?? null,
        status: { notIn: ['DELETED', 'PURGED', 'ARCHIVED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { username: true, email: true } },
        tags:     { orderBy: { name: 'asc' } },
      },
    }),
    prisma.mediaFile.findMany({
      where: {
        eventId,
        subfolderId: subfolderId ?? null,
        status: 'ARCHIVED',
      },
      orderBy: { archivedAt: 'desc' },
      include: {
        uploader: { select: { username: true, email: true } },
        tags:     { orderBy: { name: 'asc' } },
      },
    }),
  ])

  // Presign download + thumbnail URLs
  const enrich = (files: typeof activeFiles) =>
    Promise.all(
      files.map(async m => {
        const [downloadUrl, thumbnailUrl] = await Promise.all([
          getPresignedDownloadUrl(m.r2Key),
          m.thumbnailKey ? getPresignedDownloadUrl(m.thumbnailKey) : Promise.resolve(null),
        ])
        return { ...m, fileSize: m.fileSize.toString(), downloadUrl, thumbnailUrl }
      })
    )

  const [enriched, enrichedArchived] = await Promise.all([
    enrich(activeFiles),
    enrich(archivedFiles),
  ])

  // Build breadcrumb
  const activeSubfolder = subfolderId
    ? event.subfolders.find(s => s.id === subfolderId)
    : null

  const breadcrumbItems = [
    {
      label: String(event.category.year.year),
      href:  `/events`,
    },
    {
      label: event.category.name,
      href:  `/events`,
    },
    {
      label: event.name,
      href:  activeSubfolder ? `/events/${eventId}` : undefined,
    },
    ...(activeSubfolder
      ? [{ label: activeSubfolder.label }]
      : []
    ),
  ]

  const dateStr = new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{event.name}</h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {dateStr}
            </span>
            <span className="text-slate-700">·</span>
            <span>{event.category.name}</span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" />
              {event._count.mediaFiles} total files
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {showBatch && enriched.length > 0 && (
            <BatchDownloadButton
              eventId={eventId}
              eventName={event.name}
              subfolderId={subfolderId ?? null}
              subfolderLabel={activeSubfolder?.label ?? null}
              fileCount={enriched.length}
            />
          )}
          {session?.user?.role !== 'UPLOADER' && (
            <ShareButton
              linkType="EVENT"
              eventId={eventId}
              subfolderId={subfolderId ?? undefined}
              defaultTitle={activeSubfolder ? `${event.name} — ${activeSubfolder.label}` : event.name}
            />
          )}
          <Link
            href={`/upload?eventId=${eventId}${subfolderId ? `&subfolderId=${subfolderId}` : ''}`}
            className="flex items-center gap-2 text-sm font-semibold text-white
                       bg-gradient-to-r from-indigo-600 to-violet-600
                       hover:from-indigo-500 hover:to-violet-500
                       px-4 py-2.5 rounded-xl transition shrink-0 shadow shadow-indigo-500/20"
          >
            <Upload className="w-4 h-4" />
            Upload here
          </Link>
        </div>
      </div>

      {/* Subfolder tabs */}
      {event.subfolders.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/events/${eventId}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${!subfolderId
                ? 'bg-indigo-600/80 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            All files
          </Link>

          {event.subfolders.map(sf => (
            <Link
              key={sf.id}
              href={`/events/${eventId}?subfolder=${sf.id}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${sf.id === subfolderId
                  ? 'bg-indigo-600/80 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {sf.label}
            </Link>
          ))}
        </div>
      )}

      {/* Active media grid */}
      {enriched.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {enriched.map(m => (
            <MediaCard key={m.id} media={m as any} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <Image className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No media in {activeSubfolder ? `"${activeSubfolder.label}"` : 'this event'} yet.</p>
          <Link
            href={`/upload?eventId=${eventId}${subfolderId ? `&subfolderId=${subfolderId}` : ''}`}
            className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition"
          >
            Upload files →
          </Link>
        </div>
      )}

      {/* Archived media section (admin-only collapsible) */}
      {enrichedArchived.length > 0 && (
        <ArchiveSection files={enrichedArchived as any} isAdmin={isAdmin} />
      )}
    </div>
  )
}
