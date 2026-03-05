/**
 * instrumentation.ts — Next.js server startup hook
 *
 * Next.js calls the exported `register()` function exactly once when the
 * Node.js server process starts, before it handles any HTTP requests.
 * This is the correct place to run startup-time validation.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the Node.js server runtime — not in the Edge runtime or
  // during client-side bundle evaluation.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Importing lib/env validates every required environment variable.
    // If any is missing, this import throws and the server does not start.
    await import('./lib/env')
  }
}
