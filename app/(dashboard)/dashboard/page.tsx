import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  const [totalMedia, totalEvents, recentMedia] = await Promise.all([
    prisma.mediaFile.count(),
    prisma.event.count(),
    prisma.mediaFile.findMany({
      orderBy: { createdAt: 'desc' },
      take:    6,
      include: { uploader: { select: { username: true } }, event: { select: { name: true } } }
    })
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}
        </h1>
        <p className="mt-1 text-slate-400">Here's an overview of your media library.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Total Media"      value={totalMedia}  href="/media"   />
        <StatCard label="Events"           value={totalEvents} href="/events"  />
        <StatCard label="Your Role"        value={session?.user?.role ?? '—'} href="/profile" text />
      </div>

      {/* Recent uploads */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Recent Uploads</h2>
        {recentMedia.length === 0 ? (
          <p className="text-slate-500">No media yet. Upload your first file!</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {recentMedia.map((m) => (
              <div key={m.id} className="rounded-xl overflow-hidden bg-slate-800 aspect-square
                                         flex items-center justify-center text-slate-500 text-xs text-center p-2">
                <div>
                  <div className="text-2xl mb-1">{m.fileType === 'VIDEO' ? '🎬' : '🖼️'}</div>
                  <div className="truncate w-full">{m.originalName}</div>
                  {m.event && <div className="text-indigo-400 mt-0.5">{m.event.name}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  href,
  text
}: {
  label: string
  value: string | number
  href:  string
  text?: boolean
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl bg-slate-800 p-6 border border-slate-700
                 hover:border-slate-600 hover:bg-slate-700/80 transition-all group"
    >
      <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">{label}</p>
      <p className={`mt-1 font-bold text-white ${text ? 'text-xl' : 'text-4xl'}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500 group-hover:text-indigo-400 transition-colors">
        View {label.toLowerCase()} →
      </p>
    </Link>
  )
}
