import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CommunicationsHub } from '@/components/CommunicationsHub'

export const metadata = { title: 'Communications — Christhood CMMS' }

export default async function CommunicationsMessagesSentPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const isAdmin = session.user.role === 'ADMIN'
  const canSendTransfer = (['ADMIN', 'EDITOR'] as string[]).includes(session.user.role as string)

  return (
    <div className="px-0 sm:px-0">
      <CommunicationsHub
        key="messages:sent"
        initialTab="messages"
        initialTransferSubTab="inbox"
        initialMessageSubTab="sent"
        isAdmin={isAdmin}
        canSendTransfer={canSendTransfer}
      />
    </div>
  )
}
