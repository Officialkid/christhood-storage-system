/**
 * lib/settingDefaults.ts
 *
 * Single source of truth for AppSetting default values.
 * Kept in lib/ (not in a route file) so it can be imported by any server-side
 * module without triggering Next.js's "invalid Route export" build error.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  archive_threshold_months: '6',
}
