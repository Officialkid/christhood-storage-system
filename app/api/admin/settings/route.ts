import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import { SETTING_DEFAULTS }          from '@/lib/settingDefaults'

async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)          return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

// ── GET /api/admin/settings ────────────────────────────────────────────────
/**
 * Returns all application settings merged with defaults.
 * Response: { settings: Record<string, string> }
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await prisma.appSetting.findMany()
  const settings: Record<string, string> = { ...SETTING_DEFAULTS }
  for (const row of rows) settings[row.key] = row.value

  return NextResponse.json({ settings })
}

// ── PATCH /api/admin/settings ──────────────────────────────────────────────
/**
 * Update one or more settings.
 * Body: { [key: string]: string }
 * Response: { settings: Record<string, string> }
 */
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as Record<string, string>

  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') continue

    // Fetch old value for logging
    const existing = await prisma.appSetting.findUnique({ where: { key } })
    const oldValue = existing?.value ?? SETTING_DEFAULTS[key] ?? ''

    await prisma.appSetting.upsert({
      where:  { key },
      create: { key, value, updatedBy: session.user.id },
      update: { value, updatedBy: session.user.id },
    })

    await log('SETTINGS_CHANGED', session.user.id, {
      metadata: { key, oldValue, newValue: value },
    })
  }

  // Return refreshed settings
  const rows = await prisma.appSetting.findMany()
  const settings: Record<string, string> = { ...SETTING_DEFAULTS }
  for (const row of rows) settings[row.key] = row.value

  return NextResponse.json({ settings })
}
