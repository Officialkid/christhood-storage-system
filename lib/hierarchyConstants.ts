export const CATEGORY_NAMES = [
  'Saturday Fellowships',
  'Missions',
  'Conferences',
  'Special Events',
  'Outreach Programs',
] as const

export type CategoryName = (typeof CATEGORY_NAMES)[number]
