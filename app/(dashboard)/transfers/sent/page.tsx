import type { Metadata }       from 'next'
import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { redirect }            from 'next/navigation'
import { prisma }              from '@/lib/prisma'
import { SentTransfersList }   from '@/components/SentTransfersList'
import { Send }                from 'lucide-react'
import Link                    from 'next/link'

export const metadata: Metadata = { title: 'Sent Transfers — Christhood CMMS' }

export default async function SentTransfersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const transfers = await prisma.transfer.findMany({
    where:   { senderId: session.user.id },
    include: {
      recipient: { select: { id: true, username: true, name: true, email: true, role: true } },
      response:  {
        select: {
          id:                true,
          downloadedByAdmin: true,
          totalFiles:        true,
          totalSize:         true,
          createdAt:         true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Serialise BigInts and Dates
  const serialised = transfers.map(t => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    expiresAt: t.expiresAt.toISOString(),
    totalSize: Number(t.totalSize),
    response:  t.response
      ? {
          ...t.response,
          createdAt: t.response.createdAt.toISOString(),
          totalSize: Number(t.response.totalSize),
        }
      : null,
  }))

  const respondedCount = serialised.filter(
    t => t.status === 'RESPONDED' && t.response && !t.response.downloadedByAdmin
  ).length

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-600/30">
            <Send className="w-5 h-5 text-indigo-400" />
            {respondedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {respondedCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Sent Transfers</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage your outgoing file transfers</p>
          </div>
        </div>
        <Link
          href="/transfers/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          New Transfer
        </Link>
      </div>

      <SentTransfersList transfers={serialised} />
    </div>
  )
}
