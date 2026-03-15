import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/user/export-my-data ─────────────────────────────────────────────
// Returns a JSON attachment containing all data Christhood CMMS holds for the
// authenticated user: profile, uploads, activity log (capped at 1 000 rows),
// and notification preferences.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = token.id as string

  const [user, uploads, activityLogs, notifPrefs] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id:                   true,
        username:             true,
        email:                true,
        name:                 true,
        phone:                true,
        role:                 true,
        createdAt:            true,
        emailDigestFrequency: true,
        zaraLoggingOptOut:    true,
      },
    }),
    prisma.mediaFile.findMany({
      where:   { uploaderId: userId },
      select:  {
        id:           true,
        originalName: true,
        fileType:     true,
        fileSize:     true,
        status:       true,
        createdAt:    true,
        r2Key:        true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityLog.findMany({
      where:   { userId },
      select:  { id: true, action: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take:    1000,
    }),
    prisma.notificationPreference.findMany({
      where:  { userId },
      select: { category: true, email: true, push: true },
    }),
  ])

  const payload = {
    exportedAt:              new Date().toISOString(),
    profile:                 user,
    uploads,
    activityLogs,
    notificationPreferences: notifPrefs,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="christhood-my-data-${userId.slice(0, 8)}.json"`,
    },
  })
}
