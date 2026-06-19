import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CommunicationsHub } from '@/components/CommunicationsHub'

export const metadata = { title: 'Communications — Christhood CMMS' }

export default async function CommunicationsTransfersInboxPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const isAdmin = session.user.role === 'ADMIN'
  const canSendTransfer = (['ADMIN', 'EDITOR'] as string[]).includes(session.user.role as string)

  return (
    <div className="px-0 sm:px-0">
      <CommunicationsHub
        key="transfers:inbox"
        initialTab="transfers"
        initialTransferSubTab="inbox"
        initialMessageSubTab="inbox"
        isAdmin={isAdmin}
        canSendTransfer={canSendTransfer}
      />
    </div>
  )
}
