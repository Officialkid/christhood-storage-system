import { prisma } from '@/lib/prisma'
import { Upload } from 'lucide-react'
import { UploadZone } from '@/components/UploadZone'
import type { DestinationInfo, EventOption } from '@/components/UploadZone'

interface Props {
  searchParams: Promise<{ eventId?: string; subfolderId?: string }>
}

export default async function UploadPage(props: Props) {
  const searchParams = await props.searchParams
  const { eventId, subfolderId } = searchParams

  let defaultDestination: DestinationInfo | null = null

  if (eventId) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        category: { include: { year: true } },
        subfolders: { orderBy: { label: 'asc' } },
      },
    })

    if (ev) {
      const activeSubfolder = subfolderId
        ? ev.subfolders.find(s => s.id === subfolderId)
        : null

      defaultDestination = {
        eventId: ev.id,
        eventName: ev.name,
        categoryName: ev.category.name,
        year: ev.category.year.year,
        subfolderId: subfolderId ?? null,
        subfolderLabel: activeSubfolder?.label ?? null,
        subfolders: ev.subfolders,
      }
    }
  }

  const events = (await prisma.event.findMany({
    orderBy: { date: 'desc' },
    take: 100,
    include: {
      category: { include: { year: true } },
      subfolders: { orderBy: { label: 'asc' } },
    },
  })).map(ev => ({ ...ev, date: ev.date instanceof Date ? ev.date.toISOString() : ev.date })) as unknown as EventOption[]

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-600/15 p-3">
              <Upload className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fast upload flow</p>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Upload Media</h1>
              <p className="max-w-2xl text-sm text-slate-400">
                Add files to the right event, keep large uploads resumable, and follow the progress clearly from one simple screen.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:flex sm:flex-wrap sm:justify-end">
            <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5">Choose destination</span>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5">Add files or folders</span>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5">Track progress</span>
            <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5">Resume if interrupted</span>
          </div>
        </div>
      </div>

      <UploadZone defaultDestination={defaultDestination} events={events} />
    </div>
  )
}
