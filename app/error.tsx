'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Never expose raw errors to the user — log server-side via an APM tool (e.g. Sentry).
    if (process.env.NODE_ENV !== 'production') {
      console.error('[GlobalError boundary]', error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full text-center">
        {/* Warning icon */}
        <div className="flex justify-center mb-5">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10">
            <AlertTriangle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-white mb-3">
          Something went wrong
        </h1>

        <p className="text-slate-400 mb-8 leading-relaxed">
          An unexpected error occurred. Please try again, or contact the
          Christhood team if the problem persists.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                       bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-500 focus:outline-none focus:ring-2
                       focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950
                       transition-colors"
          >
            Try again
          </button>

          <a
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                       border border-slate-700 text-slate-300 text-sm font-medium
                       hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2
                       focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-950
                       transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
