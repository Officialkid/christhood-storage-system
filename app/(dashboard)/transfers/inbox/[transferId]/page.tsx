import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { redirect, notFound }  from 'next/navigation'
import { prisma }              from '@/lib/prisma'
import { TransferDetailView }  from '@/components/TransferDetailView'
import { ArrowLeft }           from 'lucide-react'
import Link                    from 'next/link'

export async function generateMetadata({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params
  const t = await prisma.transfer.findUnique({ where: { id: transferId }, select: { subject: true } })
  return { title: t ? `${t.subject} — Christhood CMMS` : 'Transfer — Christhood CMMS' }
}

export default async function TransferInboxDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>
}) {
  const { transferId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const transfer = await prisma.transfer.findUnique({
    where:   { id: transferId },
    include: {
      sender: { select: { id: true, username: true, name: true, email: true } },
      files:  true,
      response: {
        include: { files: true },
      },
    },
  })

  if (!transfer) notFound()

  // Only the recipient (or admin) may view this page
  const isRecipient = transfer.recipientId === session.user.id
  const isAdmin     = session.user.role === 'ADMIN'
  if (!isRecipient && !isAdmin) redirect('/transfers/inbox')

  // Serialise BigInts and Dates so the client component receives plain JSON
  const serialised = {
    ...transfer,
    expiresAt: transfer.expiresAt.toISOString(),
    createdAt: transfer.createdAt.toISOString(),
    totalSize: Number(transfer.totalSize),
    files: transfer.files.map(f => ({ ...f, fileSize: Number(f.fileSize) })),
    response: transfer.response
      ? {
          ...transfer.response,
          createdAt: transfer.response.createdAt.toISOString(),
          totalSize: Number(transfer.response.totalSize),
          files: transfer.response.files.map(f => ({ ...f, fileSize: Number(f.fileSize) })),
        }
      : null,
  }

  return (
    <div>
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/transfers/inbox"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Inbox
        </Link>
      </div>

      <TransferDetailView transfer={serialised} />
    </div>
  )
}
