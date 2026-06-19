import { redirect }        from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { CommunicationsHub } from '@/components/CommunicationsHub'

export const metadata = { title: 'Communications — Christhood CMMS' }

interface Props {
  params: Promise<{ slug?: string[] }>
}

export default async function CommunicationsPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const { slug } = await params
  const tab             = slug?.[0] === 'messages' ? 'messages' : 'transfers'
  const transferSubTab  = slug?.[0] === 'transfers' && slug?.[1] === 'sent' ? 'sent' : 'inbox'
  const messageSubTab   = slug?.[0] === 'messages' && slug?.[1] === 'sent' ? 'sent' : 'inbox'
  const isAdmin         = session.user.role === 'ADMIN'
  const canSendTransfer = (['ADMIN', 'EDITOR'] as string[]).includes(session.user.role as string)

  return (
    <div className="px-0 sm:px-0">
      <CommunicationsHub
        key={`${tab}:${transferSubTab}:${messageSubTab}`}
        initialTab={tab}
        initialTransferSubTab={transferSubTab}
        initialMessageSubTab={messageSubTab}
        isAdmin={isAdmin}
        canSendTransfer={canSendTransfer}
      />
    </div>
  )
}
