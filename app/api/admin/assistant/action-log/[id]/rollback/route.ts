// app/api/admin/assistant/action-log/[id]/rollback/route.ts
//
// POST /api/admin/assistant/action-log/[id]/rollback
//   Body: { confirmation: "ROLLBACK" }
//
//   Rolls back a previously executed Zara action.
//   Requires the admin to pass the string "ROLLBACK" as a safety check.
//   Admin-only.

import { NextRequest, NextResponse }    from 'next/server'
import { getToken }                     from 'next-auth/jwt'
import { rollbackAction }               from '@/lib/assistant/safety/preservation'
import type { CallerContext }           from '@/lib/assistant/tools/action-tools'

export const dynamic = 'force-dynamic'

export async function POST(
  req:     NextRequest,
  { params }: { params: { id: string } },
) {
  const token = await getToken({ req })
  if (!token || token.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const logId = params.id
  if (!logId) {
    return NextResponse.json({ error: 'Missing log ID' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  if (body.confirmation !== 'ROLLBACK') {
    return NextResponse.json(
      { error: 'Safety check failed. You must pass { "confirmation": "ROLLBACK" } in the request body.' },
      { status: 400 },
    )
  }

  const caller: CallerContext = {
    userId:   token.sub ?? (token.id as string) ?? 'unknown',
    userName: (token.name as string) ?? 'Admin',
    role:     'ADMIN',
  }

  const result = await rollbackAction(logId, caller)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ message: result.message })
}
