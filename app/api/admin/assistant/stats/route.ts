import { NextRequest } from 'next/server'
import { getToken }    from 'next-auth/jwt'
import {
  getStats,
  getErrorLog,
  getRateLimitStatus,
} from '@/lib/assistant/telemetry'

export const dynamic = 'force-dynamic'

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return json({ error: 'Unauthorized' }, 401)
  if (token.role !== 'ADMIN') return json({ error: 'Forbidden' }, 403)

  // Fetch health status from the cached health endpoint
  const healthUrl = new URL('/api/assistant/health', req.url)
  let health: Record<string, unknown> = { status: 'unknown' }
  try {
    const healthRes = await fetch(healthUrl.toString(), {
      headers: { 'x-internal-call': '1' },
    })
    health = await healthRes.json()
  } catch {
    health = { status: 'error', message: 'Could not reach health endpoint' }
  }

  return json({
    health,
    stats:       getStats(),
    errorLog:    getErrorLog(),
    rateLimits:  getRateLimitStatus(),
    serverTime:  new Date().toISOString(),
  })
}
