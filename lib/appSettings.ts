import { prisma } from '@/lib/prisma'
import { SETTING_DEFAULTS } from '@/lib/settingDefaults'

let cachedSettings: Record<string, string> | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 60_000 // 60 seconds

/**
 * Returns all AppSetting values merged over SETTING_DEFAULTS,
 * cached in-memory for 60 seconds to avoid repeated DB queries.
 */
export async function getAppSettings(): Promise<Record<string, string>> {
  const now = Date.now()
  if (cachedSettings && now < cacheExpiresAt) {
    return cachedSettings
  }

  try {
    const rows = await prisma.appSetting.findMany()
    const merged: Record<string, string> = { ...SETTING_DEFAULTS }
    for (const row of rows) {
      merged[row.key] = row.value
    }
    cachedSettings = merged
    cacheExpiresAt = now + CACHE_TTL_MS
    return merged
  } catch {
    return { ...SETTING_DEFAULTS }
  }
}

export function invalidateAppSettingsCache(): void {
  cachedSettings = null
  cacheExpiresAt = 0
}

/**
 * Returns the configured Trash retention window in days (default: 13 days).
 */
export async function getTrashRetentionDays(): Promise<number> {
  const settings = await getAppSettings()
  const raw = parseInt(settings.trash_retention_days ?? SETTING_DEFAULTS.trash_retention_days ?? '13', 10)
  if (!Number.isFinite(raw) || raw < 1) return 13
  return Math.min(365, raw)
}

export async function computeScheduledPurgeAt(from: Date = new Date()): Promise<Date> {
  const days = await getTrashRetentionDays()
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}
