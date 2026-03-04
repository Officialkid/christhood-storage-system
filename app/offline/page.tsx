import Link from 'next/link'
import { WifiOff, RefreshCw } from 'lucide-react'

export default function OfflinePage() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-slate-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-white">You're offline</h1>
            <p className="text-sm text-slate-400">
              No internet connection. Any files you add to the upload queue will be saved and uploaded automatically when you're back online.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                         bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>

            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                         border border-slate-700 hover:border-slate-600 text-slate-300
                         hover:text-white text-sm font-medium transition"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}
