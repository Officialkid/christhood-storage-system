'use client'

/**
 * Global error boundary — app/error.tsx (Next.js App Router)
 *
 * This component catches any unhandled runtime errors thrown inside the root
 * layout's subtree (every page in the app). It replaces the default Next.js
 * error UI which can expose stack traces and framework internals in development,
 * and — if production error reporting is misconfigured — in production too.
 *
 * Security goals:
 *   - Never render the original error message or stack trace to the browser.
 *   - Give users a clear, friendly message so they know something went wrong.
 *   - Provide a recovery action (try again) without a full page reload where
 *     possible.
 *
 * The `error` prop is intentionally not rendered anywhere in the JSX to
 * prevent accidental information disclosure. In development you will still
 * see the full overlay from React / Next.js dev mode — that is correct
 * behaviour and does not affect production.
 */

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to the browser console in development only — never send raw errors
    // to an external endpoint here (use a server-side error reporter instead,
    // e.g. Sentry's Next.js SDK which captures on the server before this
    // component ever renders).
    if (process.env.NODE_ENV !== 'production') {
      console.error('[GlobalError boundary]', error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Generic heading — no framework names, no status codes */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
          Something went wrong
        </h1>

        <p className="text-gray-500 mb-8 leading-relaxed">
          An unexpected error occurred. Please try again, or contact the
          Christhood team if the problem persists.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                       bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Try again
          </button>

          <a
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                       border border-gray-300 text-gray-700 text-sm font-medium
                       hover:bg-gray-100 focus:outline-none focus:ring-2
                       focus:ring-gray-400 focus:ring-offset-2 transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
