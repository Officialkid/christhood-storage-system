import { PrismaClient } from '@prisma/client'

// ── Category → short prefix map ───────────────────────────────────────────────
const CATEGORY_PREFIXES: Record<string, string> = {
  'Saturday Fellowships': 'SatFellowship',
  'Missions':             'Mission',
  'Conferences':          'Conference',
  'Special Events':       'SpecialEvent',
  'Outreach Programs':    'Outreach',
}

export function categoryToPrefix(name: string): string {
  return CATEGORY_PREFIXES[name] ?? name.replace(/\s+/g, '')
}

export function dateToYYYYMMDD(date: Date | string): string {
  const d = new Date(date)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot !== -1 ? filename.slice(dot + 1).toLowerCase() : ''
}

export interface NamingResult {
  storedName: string   // e.g. "Mission_20260315_001.jpg"  — human-readable, logged in DB
  r2Key:      string   // e.g. "events/<id>/Mission_20260315_001_a3f2c1d8.jpg"  — unique path in R2
}

/**
 * Generate only a unique R2 key for a new upload (used at presign time).
 * The storedName (human-readable sequential name) must be generated separately
 * inside the DB transaction (see generateStoredName) to avoid race conditions.
 *
 * r2Key format: "events/<eventId>/<random16hex>.<ext>"
 */
export async function generateR2Key(
  eventId:          string,
  originalFilename: string,
): Promise<{ r2Key: string; originalName: string }> {
  const ext       = getExtension(originalFilename)
  const extSuffix = ext ? `.${ext}` : ''

  const token = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const r2Key = `events/${eventId}/${token}${extSuffix}`
  return { r2Key, originalName: originalFilename }
}

/**
 * Generate a stored name and R2 key for a new upload.
 *
 * storedName follows [CategoryPrefix]_[YYYYMMDD]_[NNN].[ext]
 * r2Key appends an 8-char hex token to guarantee R2-level uniqueness even under
 * concurrent uploads with the same sequence slot.
 *
 * ⚠️  IMPORTANT: Call this inside a Prisma transaction to avoid race conditions
 * on the sequence number (two concurrent uploads can otherwise read the same count).
 */
export async function generateStoredName(
  eventId:          string,
  originalFilename: string,
  prismaClient:     PrismaClient,
): Promise<NamingResult> {
  const event = await prismaClient.event.findUniqueOrThrow({
    where:   { id: eventId },
    include: { category: true },
  })

  const prefix    = categoryToPrefix(event.category.name)
  const dateStr   = dateToYYYYMMDD(event.date)
  const ext       = getExtension(originalFilename)
  const extSuffix = ext ? `.${ext}` : ''

  // Atomic-ish sequence: count existing DB records for this event
  const count = await prismaClient.mediaFile.count({ where: { eventId } })
  const seq   = String(count + 1).padStart(3, '0')

  const baseName  = `${prefix}_${dateStr}_${seq}`
  const storedName = `${baseName}${extSuffix}`

  // Short random token keeps R2 keys collision-free (crypto is available in Node/Edge)
  const token = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const r2Key = `events/${eventId}/${baseName}_${token}${extSuffix}`

  return { storedName, r2Key }
}
