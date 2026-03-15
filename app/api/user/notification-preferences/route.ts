import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import type { NotificationCategory } from '@/lib/notifications'

/**
 * Simplified notification preferences endpoint.
 *
 * This maps a flat preference object onto the existing per-category
 * NotificationPreference table + the User.emailDigestFrequency field.
 *
 * Category groupings:
 *   notifyOnUpload       → UPLOAD_IN_FOLLOWED_FOLDER
 *   notifyOnStatusChange → FILE_STATUS_CHANGED, FILE_PUBLISHED_ALERT
 *   notifyOnTransfer     → TRANSFER_RECEIVED, TRANSFER_RESPONDED, TRANSFER_COMPLETED, TRANSFER_CANCELLED
 *   notifyOnMessage      → DIRECT_MESSAGE
 *
 * Global flags:
 *   emailNotifications   → email column on ALL categories
 *   pushNotifications    → push column on ALL categories
 */

const ALL_CATEGORIES: NotificationCategory[] = [
  'UPLOAD_IN_FOLLOWED_FOLDER',
  'FILE_STATUS_CHANGED',
  'NEW_EVENT_CREATED',
  'FILE_RESTORED',
  'WEEKLY_DIGEST',
  'FILE_PUBLISHED_ALERT',
  'STORAGE_THRESHOLD_ALERT',
  'TRANSFER_RECEIVED',
  'TRANSFER_RESPONDED',
  'TRANSFER_COMPLETED',
  'TRANSFER_CANCELLED',
  'DIRECT_MESSAGE',
]

const UPLOAD_CATS:         NotificationCategory[] = ['UPLOAD_IN_FOLLOWED_FOLDER']
const STATUS_CHANGE_CATS:  NotificationCategory[] = ['FILE_STATUS_CHANGED', 'FILE_PUBLISHED_ALERT', 'FILE_RESTORED']
const TRANSFER_CATS:       NotificationCategory[] = ['TRANSFER_RECEIVED', 'TRANSFER_RESPONDED', 'TRANSFER_COMPLETED', 'TRANSFER_CANCELLED']
const MESSAGE_CATS:        NotificationCategory[] = ['DIRECT_MESSAGE']

const VALID_DIGEST_FREQ = new Set(['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER'])

// Derive simple booleans from stored per-category prefs
function deriveSimplePrefs(prefMap: Map<string, { push: boolean; email: boolean }>) {
  const getEmail = (cats: NotificationCategory[]) =>
    cats.some(c => prefMap.get(c)?.email !== false)
  const getPush  = (cats: NotificationCategory[]) =>
    cats.some(c => prefMap.get(c)?.push !== false)

  return {
    emailNotifications:  ALL_CATEGORIES.some(c => prefMap.get(c)?.email !== false),
    pushNotifications:   ALL_CATEGORIES.some(c => prefMap.get(c)?.push  !== false),
    notifyOnUpload:      getEmail(UPLOAD_CATS) || getPush(UPLOAD_CATS),
    notifyOnStatusChange: getEmail(STATUS_CHANGE_CATS) || getPush(STATUS_CHANGE_CATS),
    notifyOnTransfer:    getEmail(TRANSFER_CATS) || getPush(TRANSFER_CATS),
    notifyOnMessage:     getEmail(MESSAGE_CATS) || getPush(MESSAGE_CATS),
  }
}

/**
 * GET /api/user/notification-preferences
 * Returns the current user's simplified notification preferences.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const [rawPrefs, user] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { emailDigestFrequency: true } }),
  ])

  const prefMap = new Map<string, { push: boolean; email: boolean }>()
  for (const p of rawPrefs) prefMap.set(p.category, { push: p.push, email: p.email })

  return NextResponse.json({
    ...deriveSimplePrefs(prefMap),
    emailDigestFrequency: user?.emailDigestFrequency ?? 'IMMEDIATE',
  })
}

/**
 * PATCH /api/user/notification-preferences
 * Body (all fields optional):
 * {
 *   emailNotifications?:   boolean
 *   pushNotifications?:    boolean
 *   notifyOnUpload?:       boolean
 *   notifyOnStatusChange?: boolean
 *   notifyOnTransfer?:     boolean
 *   notifyOnMessage?:      boolean
 *   emailDigestFrequency?: "IMMEDIATE" | "DAILY" | "WEEKLY" | "NEVER"
 * }
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = session.user.id

  const {
    emailNotifications,
    pushNotifications,
    notifyOnUpload,
    notifyOnStatusChange,
    notifyOnTransfer,
    notifyOnMessage,
    emailDigestFrequency,
  } = body as {
    emailNotifications?:   boolean
    pushNotifications?:    boolean
    notifyOnUpload?:       boolean
    notifyOnStatusChange?: boolean
    notifyOnTransfer?:     boolean
    notifyOnMessage?:      boolean
    emailDigestFrequency?: string
  }

  // Build upsert operations based on which flags were provided
  const upserts: Promise<unknown>[] = []

  function upsertCategory(category: NotificationCategory, push?: boolean, email?: boolean) {
    if (push === undefined && email === undefined) return
    upserts.push(
      prisma.notificationPreference.upsert({
        where:  { userId_category: { userId, category } },
        create: {
          userId,
          category,
          push:  push  ?? true,
          email: email ?? true,
        },
        update: {
          ...(push  !== undefined ? { push }  : {}),
          ...(email !== undefined ? { email } : {}),
        },
      }),
    )
  }

  function applyGlobalEmail(enabled: boolean) {
    for (const cat of ALL_CATEGORIES) upsertCategory(cat, undefined, enabled)
  }

  function applyGlobalPush(enabled: boolean) {
    for (const cat of ALL_CATEGORIES) upsertCategory(cat, enabled, undefined)
  }

  function applyCategoryGroup(cats: NotificationCategory[], enabled: boolean) {
    for (const cat of cats) upsertCategory(cat, enabled, enabled)
  }

  if (typeof emailNotifications === 'boolean') applyGlobalEmail(emailNotifications)
  if (typeof pushNotifications  === 'boolean') applyGlobalPush(pushNotifications)
  if (typeof notifyOnUpload       === 'boolean') applyCategoryGroup(UPLOAD_CATS,        notifyOnUpload)
  if (typeof notifyOnStatusChange === 'boolean') applyCategoryGroup(STATUS_CHANGE_CATS, notifyOnStatusChange)
  if (typeof notifyOnTransfer     === 'boolean') applyCategoryGroup(TRANSFER_CATS,      notifyOnTransfer)
  if (typeof notifyOnMessage      === 'boolean') applyCategoryGroup(MESSAGE_CATS,       notifyOnMessage)

  // emailDigestFrequency — stored on User model
  if (typeof emailDigestFrequency === 'string') {
    if (!VALID_DIGEST_FREQ.has(emailDigestFrequency)) {
      return NextResponse.json(
        { error: 'emailDigestFrequency must be IMMEDIATE | DAILY | WEEKLY | NEVER' },
        { status: 400 },
      )
    }
    upserts.push(
      prisma.user.update({
        where: { id: userId },
        data:  { emailDigestFrequency },
      }),
    )
  }

  if (upserts.length === 0) {
    return NextResponse.json({ ok: true, message: 'No changes provided' })
  }

  await Promise.all(upserts)

  // Return updated preferences
  const [rawPrefs, user] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { emailDigestFrequency: true } }),
  ])

  const prefMap = new Map<string, { push: boolean; email: boolean }>()
  for (const p of rawPrefs) prefMap.set(p.category, { push: p.push, email: p.email })

  return NextResponse.json({
    ok: true,
    preferences: {
      ...deriveSimplePrefs(prefMap),
      emailDigestFrequency: user?.emailDigestFrequency ?? 'IMMEDIATE',
    },
  })
}
