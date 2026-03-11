import { getServerSession } from 'next-auth'
import { authOptions }     from '@/lib/auth'
import { redirect }        from 'next/navigation'
import { MessageCompose }  from '@/components/MessageCompose'
import { Send }            from 'lucide-react'

export const metadata = { title: 'New Message — Christhood CMMS' }

export default async function NewMessagePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const senderName = session.user.name ?? session.user.username ?? 'Admin'

  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-1">
          <Send className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">Compose Message</h1>
        </div>
        <p className="text-sm text-slate-400">
          Send a direct message to specific team members or broadcast to an entire role group.
        </p>
      </div>

      <MessageCompose senderName={senderName} />
    </div>
  )
}
