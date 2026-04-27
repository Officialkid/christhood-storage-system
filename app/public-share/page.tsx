import Link from 'next/link'
import { Sparkles, Link2, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function PublicShareMaintenancePage() {
  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/20 p-8 sm:p-10 shadow-2xl shadow-black/30">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300 mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Product Update
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">ShareLink is currently unavailable</h1>
            <p className="text-slate-300 mt-2 leading-relaxed">
              We are updating ShareLink for better reliability and a smoother sharing experience.
              It will be back soon.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Back to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/transfers/new"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600 hover:border-slate-500 px-4 py-2.5 text-sm text-slate-200 transition-colors"
          >
            Use Transfers instead
          </Link>
        </div>
      </div>
    </div>
  )
}
