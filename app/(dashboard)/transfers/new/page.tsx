import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { redirect }         from 'next/navigation'
import { NewTransferForm }  from '@/components/NewTransferForm'
import { Send }             from 'lucide-react'

export const metadata = { title: 'New Transfer — Christhood CMMS' }

export default async function NewTransferPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-600/30">
          <Send className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">New File Transfer</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Upload fresh files and send them to a recipient for editing
          </p>
        </div>
      </div>

      <NewTransferForm />
    </div>
  )
}
