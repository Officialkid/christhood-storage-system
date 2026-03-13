/**
 * The 7 official Christhood Media Team event categories.
 * Does NOT include "Other" — that is a UI sentinel that triggers custom category creation.
 */
export const OFFICIAL_CATEGORY_NAMES = [
  'Saturday Fellowships',
  'Missions',
  'Branch Excandidates Programme',
  'Teen Life',
  'Mentorship Camp',
  'Jewels Kids Camp',
  'Special Events',
] as const

export type OfficialCategoryName = (typeof OFFICIAL_CATEGORY_NAMES)[number]

/**
 * Sentinel value shown at the bottom of the Create Event category dropdown.
 * When selected, the user enters a custom category name which is created fresh.
 */
export const OTHER_CATEGORY_SENTINEL = 'Other'

// ── Legacy aliases (kept so existing imports don't break) ──────────────────
/** @deprecated Use OFFICIAL_CATEGORY_NAMES instead. */
export const CATEGORY_NAMES = OFFICIAL_CATEGORY_NAMES
export type CategoryName = OfficialCategoryName
