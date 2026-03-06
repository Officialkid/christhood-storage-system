import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * Simple liveness probe used by Render (and any load balancer) to confirm
 * the container is running and accepting requests.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
