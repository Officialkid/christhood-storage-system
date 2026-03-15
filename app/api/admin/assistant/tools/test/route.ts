// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/assistant/tools/test
//
// Enhanced connection test for the admin debug panel.
// Tests three layers independently:
//   1. Gemini API connection  (pings the health endpoint)
//   2. Database connection    (prisma.user.count())
//   3. Tool layer             (executeReadTool 'getStorageStats')
//
// ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest }   from 'next/server'
import { getToken }      from 'next-auth/jwt'
import { prisma }        from '@/lib/prisma'
import { executeReadTool } from '@/lib/assistant/tools/read-tools'

export const dynamic = 'force-dynamic'

type TestStatus = 'ok' | 'error'

interface TestResult {
  gemini:   TestStatus
  database: TestStatus
  tools:    TestStatus
  detail: {
    geminiMessage?:   string
    geminiModel?:     string
    databaseMessage?: string
    userCount?:       number
    toolsMessage?:    string
    totalMs:          number
  }
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id)             return json({ error: 'Unauthorized' }, 401)
  if (token.role !== 'ADMIN') return json({ error: 'Forbidden' },    403)

  const start  = Date.now()
  const result: TestResult = {
    gemini:   'error',
    database: 'error',
    tools:    'error',
    detail:   { totalMs: 0 },
  }

  // ── 1. Gemini connection ───────────────────────────────────────────────────
  try {
    const healthUrl = new URL('/api/assistant/health', req.url)
    const healthRes = await fetch(healthUrl.toString(), {
      headers: { 'x-internal-call': '1' },
    })
    const healthJson = await healthRes.json()
    if (healthJson.status === 'ok') {
      result.gemini                = 'ok'
      result.detail.geminiMessage  = 'Gemini API responded successfully'
      result.detail.geminiModel    = healthJson.model ?? 'gemini-2.0-flash-lite'
    } else {
      result.detail.geminiMessage  = healthJson.message ?? 'Health check returned non-ok status'
    }
  } catch (e) {
    result.detail.geminiMessage = e instanceof Error ? e.message : 'Health check request failed'
  }

  // ── 2. Database connection ─────────────────────────────────────────────────
  try {
    const count = await prisma.user.count()
    result.database                = 'ok'
    result.detail.databaseMessage  = 'Prisma connected successfully'
    result.detail.userCount        = count
  } catch (e) {
    result.detail.databaseMessage = e instanceof Error ? e.message : 'Database query failed'
  }

  // ── 3. Tool layer (getStorageStats exercises both Prisma and tool code) ────
  try {
    const adminId = token.id as string
    const toolOut = await executeReadTool('getStorageStats', {}, {
      userId:   adminId,
      userName: 'Admin Test',
      role:     'ADMIN',
    }) as Record<string, unknown>

    if ('error' in toolOut) {
      result.detail.toolsMessage = `Tool returned error: ${String(toolOut.error)}`
    } else {
      result.tools               = 'ok'
      result.detail.toolsMessage = `getStorageStats returned ${Object.keys(toolOut).length} fields`
    }
  } catch (e) {
    result.detail.toolsMessage = e instanceof Error ? e.message : 'Tool execution failed'
  }

  result.detail.totalMs = Date.now() - start

  return json(result)
}
