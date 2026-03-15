import { NextResponse } from 'next/server'
import { Prisma }       from '@prisma/client'

// ── Custom typed error ─────────────────────────────────────────────────────────
// Throw this anywhere in a route to produce a specific HTTP status + friendly message.
// Example: throw new ApiError(403, "You don't have permission for this action.")
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Core handler ───────────────────────────────────────────────────────────────

/**
 * Maps any thrown value to a friendly, non-leaking JSON error response.
 * Call this in every API route's catch clause.
 *
 * @param err     The caught value (unknown).
 * @param context Optional tag for server-side console logs, e.g. 'POST /api/upload'.
 */
export function handleApiError(err: unknown, context?: string): NextResponse {
  // Always log on the server — never expose raw stack to client.
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[API Error]${context ? ` [${context}]` : ''}`, err)
  }

  // ── 1. First-party ApiError ─────────────────────────────────────────────────
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }

  // ── 2. Prisma known errors ──────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025':
        return NextResponse.json({ error: 'This record was not found.' }, { status: 404 })
      case 'P2002':
        return NextResponse.json(
          { error: 'This already exists — try a different value.' },
          { status: 409 },
        )
      case 'P2003':
      case 'P2014':
        return NextResponse.json({ error: 'Related record not found.' }, { status: 400 })
      case 'P2011':
      case 'P2012':
        return NextResponse.json({ error: 'A required field is missing.' }, { status: 400 })
      default:
        return NextResponse.json(
          { error: 'A database error occurred. Please try again.' },
          { status: 500 },
        )
    }
  }

  // ── 3. Prisma connection / validation errors ────────────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json({ error: 'Invalid request data.' }, { status: 400 })
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      { error: 'Database unavailable — please try again shortly.' },
      { status: 503 },
    )
  }

  // ── 4. Standard Error duck-typing ──────────────────────────────────────────
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()

    // Auth/session signals
    if (
      msg.includes('unauthorized') || msg.includes('unauthenticated') ||
      msg.includes('not authenticated') || msg.includes('no session')
    ) {
      return NextResponse.json({ error: 'Please log in to continue.' }, { status: 401 })
    }

    // Permission signals
    if (
      msg.includes('forbidden') || msg.includes('not allowed') ||
      msg.includes('permission denied') || msg.includes('access denied')
    ) {
      return NextResponse.json(
        { error: "You don't have permission for this action." },
        { status: 403 },
      )
    }

    // R2 / S3 storage signals
    if (
      msg.includes('nosuchkey') || msg.includes('s3') ||
      msg.includes('storageclass') || msg.includes('r2error') ||
      msg.includes('cloudflare') || msg.includes('putobject') ||
      msg.includes('getobject')
    ) {
      return NextResponse.json(
        { error: 'Storage service unavailable — try again shortly.' },
        { status: 503 },
      )
    }

    // Network / fetch signals
    if (
      msg.includes('econnrefused') || msg.includes('network') ||
      msg.includes('socket') || msg.includes('etimedout') ||
      msg.includes('enotfound') || msg.includes('fetch failed')
    ) {
      return NextResponse.json(
        { error: 'A network error occurred. Check your connection and try again.' },
        { status: 503 },
      )
    }

    // Zod-like validation (message starts with field path)
    if (
      msg.includes('"path"') || msg.includes('invalid_type') ||
      msg.includes('too_small') || msg.includes('too_big') ||
      msg.includes('invalid_string')
    ) {
      return NextResponse.json({ error: 'Invalid request data.', detail: err.message }, { status: 400 })
    }
  }

  // ── 5. Unknown / unexpected ─────────────────────────────────────────────────
  return NextResponse.json(
    { error: 'Something went wrong — your admin has been notified.' },
    { status: 500 },
  )
}

// ── Higher-order wrapper ───────────────────────────────────────────────────────
// Wraps a Next.js App Router route handler so any uncaught throw is handled
// gracefully without a naked 500 or stack trace.
//
// Usage:
//   export const POST = withErrorHandler(async (req) => {
//     const body = await req.json()
//     // pure logic, no try-catch needed
//     return NextResponse.json({ ok: true })
//   })
//
// Works for both simple handlers (req) and dynamic-segment handlers (req, ctx).
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (err) {
      return handleApiError(err)
    }
  }
}
