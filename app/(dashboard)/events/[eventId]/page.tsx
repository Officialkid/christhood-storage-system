import { notFound }            from 'next/navigation'
import Link                    from 'next/link'
import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { prisma }              from '@/lib/prisma'
import { Breadcrumb }          from '@/components/Breadcrumb'
import { MediaGrid }           from '@/components/MediaGrid'
import { BatchDownloadButton } from '@/components/BatchDownloadButton'
import { ArchiveSection }      from '@/components/ArchiveSection'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { canBatchDownload }    from '@/lib/downloadAuth'
import { CalendarDays, Image, Upload } from 'lucide-react'
import ShareButton             from '@/components/ShareButton'
import { EventFolderBar }      from '@/components/EventFolderBar'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ subfolder?: string }>
}

export default async function EventDetailPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { eventId }    = params
  const subfolderId    = searchParams.subfolder

  const session = await getServerSession(authOptions)
  const showBatch = session?.user?.role ? canBatchDownload(session.user.role) : false

  // Fetch event + context for breadcrumb
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      category:  { include: { year: true } },
      subfolders: {
        orderBy: { label: 'asc' },
        include: {
          _count: { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
        },
      },
      _count:    { select: { mediaFiles: { where: { status: { notIn: ['DELETED', 'PURGED'] } } } } },
    },
  })

  if (!event) notFound()

  const sortedSubfolders = [...event.subfolders].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
  )

  const isAdmin = session?.user?.role === 'ADMIN'

  // Fetch active + archived media separately
  const [activeFiles, archivedFiles] = await Promise.all([
    prisma.mediaFile.findMany({
      where: {
        eventId,
        ...(subfolderId ? { subfolderId } : {}),
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
        ...(subfolderId ? { subfolderId } : {}),
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
    ? sortedSubfolders.find(s => s.id === subfolderId)
    : null

  const breadcrumbItems = [
    {
      label: String(event.category.year.year),
      href:  `/events`,
    },
    {
      label: event.category.name,
      href:  `/events?category=${encodeURIComponent(event.category.name)}`,
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

  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{event.name}</h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400 flex-wrap">
            {dateStr && (
              <>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {dateStr}
                </span>
                <span className="text-slate-700">·</span>
              </>
            )}
            <Link
              href={`/events?category=${encodeURIComponent(event.category.name)}`}
              className="hover:text-indigo-300 transition"
            >
              {event.category.name}
            </Link>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" />
              {event._count.mediaFiles} total file{event._count.mediaFiles !== 1 ? 's' : ''}
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
            {activeSubfolder ? `Upload to ${activeSubfolder.label}` : 'Upload here'}
          </Link>
        </div>
      </div>

      {/* Interactive Folders / Days bar (supports inline folder creation) */}
      <EventFolderBar
        eventId={eventId}
        subfolders={sortedSubfolders}
        activeSubfolderId={subfolderId}
        totalFilesCount={event._count.mediaFiles}
        isAdmin={isAdmin}
      />

      {/* Active media grid (with Preview Lightbox, Select Mode & Verified Bulk Delete) */}
      {enriched.length > 0 ? (
        <MediaGrid files={enriched as any} />
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
