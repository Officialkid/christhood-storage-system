import { redirect }      from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth'
import { MessageInbox }   from '@/components/MessageInbox'

export const metadata = { title: 'Messages — Christhood CMMS' }

export default async function MessagesInboxPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  return <MessageInbox />
}
