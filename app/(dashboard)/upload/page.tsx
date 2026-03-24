import { prisma }          from '@/lib/prisma'
import { UploadZone }       from '@/components/UploadZone'
import type { DestinationInfo, EventOption } from '@/components/UploadZone'
import { Upload }           from 'lucide-react'

interface Props {
  searchParams: Promise<{ eventId?: string; subfolderId?: string }>
}

export default async function UploadPage(props: Props) {
  const searchParams = await props.searchParams;
  const { eventId, subfolderId } = searchParams

  // ── Pre-filled destination ─────────────────────────────────────────────────
  let defaultDestination: DestinationInfo | null = null

  if (eventId) {
    const ev = await prisma.event.findUnique({
      where:   { id: eventId },
      include: {
        category:   { include: { year: true } },
        subfolders: { orderBy: { label: 'asc' } },
      },
    })
    if (ev) {
      const activeSubfolder = subfolderId
        ? ev.subfolders.find(s => s.id === subfolderId)
        : null

      defaultDestination = {
        eventId:         ev.id,
        eventName:       ev.name,
        categoryName:    ev.category.name,
        year:            ev.category.year.year,
        subfolderId:     subfolderId ?? null,
        subfolderLabel:  activeSubfolder?.label ?? null,
        subfolders:      ev.subfolders,
      }
    }
  }

  // ── All events for the selector (when no pre-fill) ─────────────────────────
  const events = (await prisma.event.findMany({
    orderBy: { date: 'desc' },
    take:    100,
    include: {
      category:   { include: { year: true } },
      subfolders: { orderBy: { label: 'asc' } },
    },
  })).map((ev) => ({ ...ev, date: ev.date instanceof Date ? ev.date.toISOString() : ev.date })) as unknown as EventOption[]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600/20 border border-indigo-600/30 rounded-xl">
          <Upload className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Upload Media</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Files go directly to Cloudflare R2 — large videos use resumable chunked uploads
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <UploadZone defaultDestination={defaultDestination} events={events} />
    </div>
  )
}
