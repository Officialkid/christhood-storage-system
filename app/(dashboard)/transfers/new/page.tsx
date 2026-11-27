import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { redirect }         from 'next/navigation'
import { NewTransferForm }  from '@/components/NewTransferForm'
import { Send }             from 'lucide-react'

export const metadata = { title: 'New Transfer — Christhood CMMS' }

export default async function NewTransferPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-600/30">
          <Send className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Send & Share Media</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Upload videos or pick from CMMS Events — share via instant link, WhatsApp, or directly to a teammate
          </p>
        </div>
      </div>

      <NewTransferForm />
    </div>
  )
}
