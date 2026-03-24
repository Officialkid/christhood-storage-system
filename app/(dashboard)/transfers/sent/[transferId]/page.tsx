import type { Metadata }          from 'next'
import { getServerSession }       from 'next-auth'
import { authOptions }            from '@/lib/auth'
import { redirect, notFound }     from 'next/navigation'
import { prisma }                 from '@/lib/prisma'
import { SentTransferDetail }     from '@/components/SentTransferDetail'
import Link                       from 'next/link'
import { ChevronLeft }            from 'lucide-react'
import ShareButton                from '@/components/ShareButton'

export const metadata: Metadata = { title: 'Transfer Detail — Christhood CMMS' }

interface Props {
  params: Promise<{ transferId: string }>
}

export default async function SentTransferDetailPage(props: Props) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const transfer = await prisma.transfer.findUnique({
    where:   { id: params.transferId },
    include: {
      recipient: { select: { id: true, username: true, name: true, email: true, role: true } },
      files:     true,
      response:  { include: { files: true } },
    },
  })

  if (!transfer) notFound()

  // Only the sender (or any admin) may access
  const isSender  = transfer.senderId === session.user.id
  if (!isSender) redirect('/transfers/sent')

  // Serialise BigInts and Dates for the client component
  const serialised = {
    id:         transfer.id,
    subject:    transfer.subject,
    message:    transfer.message ?? null,
    status:     transfer.status,
    totalFiles: transfer.totalFiles,
    totalSize:  Number(transfer.totalSize),
    expiresAt:  transfer.expiresAt.toISOString(),
    createdAt:  transfer.createdAt.toISOString(),
    updatedAt:  transfer.updatedAt.toISOString(),
    recipient: {
      id:       transfer.recipient.id,
      username: transfer.recipient.username ?? null,
      name:     transfer.recipient.name ?? null,
      email:    transfer.recipient.email,
      role:     transfer.recipient.role,
    },
    files: transfer.files.map(f => ({
      id:           f.id,
      originalName: f.originalName,
      fileSize:     Number(f.fileSize),
      mimeType:     f.mimeType,
      folderPath:   f.folderPath ?? null,
      checksum:     f.checksum,
    })),
    response: transfer.response
      ? {
          id:                transfer.response.id,
          message:           transfer.response.message ?? null,
          totalFiles:        transfer.response.totalFiles,
          totalSize:         Number(transfer.response.totalSize),
          downloadedByAdmin: transfer.response.downloadedByAdmin,
          createdAt:         transfer.response.createdAt.toISOString(),
          files: transfer.response.files.map(f => ({
            id:           f.id,
            originalName: f.originalName,
            fileSize:     Number(f.fileSize),
            mimeType:     f.mimeType,
            folderPath:   f.folderPath ?? null,
            checksum:     f.checksum,
          })),
        }
      : null,
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/transfers/sent"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Sent Transfers
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div />
        <ShareButton
          linkType="TRANSFER"
          transferId={transfer.id}
          defaultTitle={transfer.subject}
        />
      </div>

      <SentTransferDetail transfer={serialised} />
    </div>
  )
}
