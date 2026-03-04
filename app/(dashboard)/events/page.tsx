import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { CalendarDays, FolderOpen, Image, ArrowRight } from 'lucide-react'

export default async function EventsPage() {
  const session = await getServerSession(authOptions)

  // Fetch summary stats
  const [yearCount, eventCount, mediaCount, recentEvents] = await Promise.all([
    prisma.year.count(),
    prisma.event.count(),
    prisma.mediaFile.count(),
    prisma.event.findMany({
      orderBy: { date: 'desc' },
      take: 8,
      include: {
        category: { include: { year: true } },
        _count:   { select: { mediaFiles: true } },
      },
    }),
  ])

  return (
    <div className="max-w-3xl space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Event Library</h1>
        <p className="mt-1 text-slate-400 text-sm">
          Browse events and their media by selecting a year or event in the panel on the left.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: FolderOpen,    label: 'Years',       value: yearCount  },
          { icon: CalendarDays,  label: 'Events',      value: eventCount },
          { icon: Image,         label: 'Media files', value: mediaCount },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label}
               className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3">
              <Icon className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Recent Events</h2>
          <div className="space-y-2">
            {recentEvents.map(event => {
              const dateStr = new Date(event.date).toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              })
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex items-center gap-4 px-4 py-3 bg-slate-900/50
                             border border-slate-800/50 rounded-xl hover:border-slate-700
                             hover:bg-slate-900 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{event.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {event.category.year.year} · {event.category.name} · {dateStr}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">
                      {event._count.mediaFiles} files
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition" />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {eventCount === 0 && (
        <div className="text-center py-16 text-slate-600">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No events yet.</p>
          {session?.user?.role === 'ADMIN' && (
            <Link href="/admin/hierarchy"
                  className="inline-block mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition">
              Create your first event →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
