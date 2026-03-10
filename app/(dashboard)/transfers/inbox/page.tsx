import { getServerSession }   from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { redirect }            from 'next/navigation'
import { prisma }              from '@/lib/prisma'
import { TransferInbox }       from '@/components/TransferInbox'
import { Inbox }               from 'lucide-react'

export const metadata = { title: 'My Inbox — Christhood CMMS' }

export default async function TransferInboxPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const transfers = await prisma.transfer.findMany({
    where:   { recipientId: session.user.id },
    include: {
      sender: { select: { id: true, username: true, name: true, email: true } },
      files:  { select: { id: true, originalName: true, fileSize: true, mimeType: true, folderPath: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Prisma BigInt → serialisable plain number for client props
  const serialised = transfers.map(t => ({
    ...t,
    totalSize: Number(t.totalSize),
    files: t.files.map(f => ({ ...f, fileSize: Number(f.fileSize) })),
  }))

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-600/30">
          <Inbox className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">My Inbox</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Files sent to you by the admin — download, review and respond
          </p>
        </div>
      </div>

      <TransferInbox transfers={serialised} />
    </div>
  )
}
