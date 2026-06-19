import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { logger } from '@/lib/logger'
import { getDashboardData } from '@/lib/dashboard-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    logger.warn('DASHBOARD_AUTH_FAIL', { route: '/api/dashboard', message: 'getToken returned null — check NEXTAUTH_SECRET env var' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = token.id as string
  const role = (token.role as string) ?? 'UPLOADER'

  try {
    const data = await getDashboardData(userId, role)
    return NextResponse.json({ ...data, isFallback: false })
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string }
    logger.error('DASHBOARD_ERROR', { userId, userRole: role, route: '/api/dashboard', error: err?.message, errorCode: err?.code, message: 'Failed to load dashboard data' })
    return NextResponse.json(
      { error: 'Failed to load dashboard data', detail: err?.message ?? 'Unknown error' },
      { status: 500 },
    )
  }
}
