// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/assistant/tools
//   Returns telemetry: tool call log, pending actions, action history, perf stats.
//
// POST /api/admin/assistant/tools
//   Body: { action: 'cancel', pendingActionId: string }
//   Cancels a pending confirmation action.
//
// ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest }       from 'next/server'
import { getToken }          from 'next-auth/jwt'
import {
  getToolCallLog,
  getActionHistory,
  getToolPerfStats,
}                            from '@/lib/assistant/tool-telemetry'
import {
  listPendingActions,
  cancelPendingAction,
}                            from '@/lib/assistant/tools/action-tools'

export const dynamic = 'force-dynamic'

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — return all telemetry
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id)          return json({ error: 'Unauthorized' },  401)
  if (token.role !== 'ADMIN') return json({ error: 'Forbidden' }, 403)

  return json({
    toolCallLog:    getToolCallLog(),
    pendingActions: listPendingActions(),
    actionHistory:  getActionHistory(),
    perfStats:      getToolPerfStats(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — cancel a pending action
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id)          return json({ error: 'Unauthorized' },  401)
  if (token.role !== 'ADMIN') return json({ error: 'Forbidden' }, 403)

  let body: { action?: unknown; pendingActionId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }

  if (body.action !== 'cancel') {
    return json({ error: `Unknown action: "${body.action}".` }, 400)
  }

  if (typeof body.pendingActionId !== 'string' || !body.pendingActionId.trim()) {
    return json({ error: 'pendingActionId is required.' }, 400)
  }

  const adminId   = token.id   as string
  const adminName = ((token.name as string | null) ?? (token.username as string | null) ?? 'Admin')

  const cancelled = cancelPendingAction(body.pendingActionId, {
    userId:   adminId,
    userName: adminName,
  })

  if (!cancelled) {
    return json({ error: 'Pending action not found or already expired.' }, 404)
  }

  return json({ cancelled: true, toolName: cancelled.toolName })
}
