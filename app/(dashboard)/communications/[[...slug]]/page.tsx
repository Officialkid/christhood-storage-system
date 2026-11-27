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
  // Forward deep transfer detail links (/communications/transfers/inbox/<id> or /sent/<id>) to their dedicated detail pages
  if (slug?.[0] === 'transfers' && (slug?.[1] === 'inbox' || slug?.[1] === 'sent') && slug?.[2]) {
    redirect(`/transfers/${slug[1]}/${slug[2]}`)
  }

  const tab             = slug?.[0] === 'messages' ? 'messages' : 'transfers'
  const transferSubTab  = slug?.[0] === 'transfers' && slug?.[1] === 'sent' ? 'sent' : 'inbox'
  const messageSubTab   = slug?.[0] === 'messages' && slug?.[1] === 'sent' ? 'sent' : 'inbox'
  const isAdmin         = session.user.role === 'ADMIN'
  const canSendTransfer = true

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
