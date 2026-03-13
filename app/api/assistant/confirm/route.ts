// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assistant/confirm
//
// Step 2 of the action confirmation flow.
//
// The flow:
//   Step 1 → POST /api/assistant       → Zara proposes an action
//            ← SSE: { type: "confirmation_required", message, pendingActionId }
//   Step 2 → POST /api/assistant/confirm { pendingActionId }
//            ← SSE: { token: "Done! ..." } ... [DONE]
//
// This endpoint:
//   1. Authenticates the requesting user (same JWT check as the main route).
//   2. Looks up the pending action by ID (stored in the module-level Map in action-tools.ts).
//   3. Validates the action belongs to the same user and has not expired (5 min TTL).
//   4. Executes the action and streams the result back as SSE.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest }                from 'next/server'
import { getToken }                   from 'next-auth/jwt'
import { executePendingAction }       from '@/lib/assistant/tools/action-tools'
import type { AppRole }               from '@/types'

export const dynamic = 'force-dynamic'

function jsonResponse(body: object, status: number, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — reject cleanly
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST' })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assistant/confirm
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  // ── 1. Authentication ──────────────────────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    return jsonResponse({ error: 'Please log in to use the assistant.' }, 401)
  }

  const userId   = token.id as string
  const userName = (token.name as string | null)
    ?? (token.username as string | null)
    ?? 'Unknown'
  const role     = ((token.role as AppRole | null) ?? 'UPLOADER') as AppRole

  const caller = { userId, userName, role }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { pendingActionId?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { pendingActionId } = body

  if (typeof pendingActionId !== 'string' || !pendingActionId.trim()) {
    return jsonResponse({ error: 'pendingActionId is required.' }, 400)
  }

  // ── 3. Execute pending action and stream SSE response ─────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) =>
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))

      try {
        const result = await executePendingAction(pendingActionId, caller)

        if ('error' in result && result.error) {
          // Action failed or expired — send the error message as a token so
          // the UI renders it inline as a chat message (not a hard error card)
          send(JSON.stringify({ error: result.error }))
        } else if ('result' in result && result.result) {
          // Success — stream the warm completion message character by character
          // so it feels like Zara is typing the confirmation
          for (const char of result.result) {
            send(JSON.stringify({ token: char }))
          }
        } else {
          send(JSON.stringify({ error: 'The action returned an unexpected result. Please check manually.' }))
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[/api/assistant/confirm]', msg)
        send(JSON.stringify({ error: 'Something went wrong executing that action. Please try again.' }))
      } finally {
        send('[DONE]')
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
