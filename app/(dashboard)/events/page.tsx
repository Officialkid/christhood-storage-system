import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { CalendarDays, FolderOpen, Image } from 'lucide-react'
import { RecentEventsList } from '@/components/RecentEventsList'

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
        <RecentEventsList
          events={recentEvents.map(e => ({
            id:       e.id,
            name:     e.name,
            date:     e.date.toISOString(),
            category: e.category,
            _count:   e._count,
          }))}
          isAdmin={session?.user?.role === 'ADMIN'}
        />
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
