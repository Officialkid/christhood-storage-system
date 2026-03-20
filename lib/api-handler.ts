/**
 * lib/api-handler.ts
 *
 * Higher-order function that wraps any Next.js App Router handler with
 * automatic timing, structured success logging, and unhandled-error catching.
 *
 * Usage — wrap the exported handler AFTER defining your route logic:
 *
 *   export const POST = withLogging('/api/upload', async (req) => {
 *     // your route logic — no outer try/catch needed for unhandled errors
 *   })
 *
 * What it does:
 *   1. Records the wall-clock duration of the entire handler.
 *   2. On success: logs API_REQUEST at INFO level with route + duration.
 *   3. On unhandled throw: logs API_ERROR at ERROR level and returns a safe
 *      500 response so no stack trace ever leaks to the client.
 *
 * NOTE: Routes that already have comprehensive try/catch blocks and specific
 * error handling (streaming routes, file-download endpoints, etc.) should
 * continue to use inline logger calls rather than this wrapper, since the
 * wrapper's catch block would swallow nuanced error responses.
 */

import { logger } from '@/lib/logger'

export function withLogging(
  routeName: string,
  handler:   (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now()

    try {
      const response = await handler(req)
      const duration = Date.now() - startTime

      logger.info('API_REQUEST', {
        route:    routeName,
        duration,
        message:  `${routeName} completed in ${duration}ms`,
      })

      if (duration > 3_000) {
        logger.warn('SLOW_OPERATION', {
          route:    routeName,
          duration,
          message:  `${routeName} took ${duration}ms — may need query optimisation`,
        })
      }

      return response
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const err      = error as { message?: string; code?: string; status?: number }

      logger.error('API_ERROR', {
        route:     routeName,
        duration,
        error:     err?.message ?? String(error),
        errorCode: String(err?.code ?? err?.status ?? ''),
        message:   `Unhandled error in ${routeName}: ${err?.message ?? String(error)}`,
      })

      return Response.json(
        { error: 'Something went wrong. Your admin has been notified.' },
        { status: 500 },
      )
    }
  }
}
