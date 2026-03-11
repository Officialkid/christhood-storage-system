import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SentMessages } from '@/components/SentMessages'

export const metadata = {
  title: 'Sent Messages — Christhood CMMS',
}

export default async function SentMessagesPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="p-4 md:p-6">
      <SentMessages />
    </div>
  )
}
