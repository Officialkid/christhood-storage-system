/**
 * lib/cache.ts
 *
 * SWR cache-key registry and cross-component cache invalidation helpers.
 *
 * Import `invalidateFileCache` after any operation that adds, removes, or
 * changes the status of a file so that the FolderTree sidebar counts and
 * dashboard stats reflect the change immediately — without requiring a full
 * page reload.
 *
 * Usage:
 *   import { invalidateFileCache } from '@/lib/cache'
 *   // inside an async handler after a successful mutation:
 *   await invalidateFileCache(eventId)
 */
import { mutate } from 'swr'

// ── Stable key constants ──────────────────────────────────────────────────────

export const CACHE_KEYS = {
  /** Full Year → Category → Event → Subfolder tree (FolderTree sidebar). */
  hierarchy: '/api/hierarchy',
  /** Dashboard stats + recent uploads + activity feed. */
  dashboard: '/api/dashboard',
  /** Paginated media grid (all events). */
  media: '/api/media',
  /** Per-event media list (include eventId to target just that event). */
  eventMedia: (eventId: string) => `/api/media?eventId=${eventId}`,
} as const

// ── SWR config preset (reuse on every useSWR call) ───────────────────────────

export const SWR_CONFIG = {
  /** Refetch in the background every 15 s. */
  refreshInterval:      15_000,
  /** Refetch when the browser tab regains focus. */
  revalidateOnFocus:    true,
  /** Refetch when the browser reconnects to the internet. */
  revalidateOnReconnect: true,
  /** Don't duplicate requests within 5 s. */
  dedupingInterval:     5_000,
} as const

// ── Invalidation helper ───────────────────────────────────────────────────────

/**
 * Trigger immediate revalidation of every cache affected by a file mutation
 * (upload complete, soft-delete, status change, archive).
 *
 * @param eventId  Optional — when provided, also revalidates the per-event
 *                 media list so the event detail page updates instantly.
 */
export async function invalidateFileCache(eventId?: string): Promise<void> {
  await Promise.all([
    mutate(CACHE_KEYS.hierarchy),
    mutate(CACHE_KEYS.dashboard),
    mutate(CACHE_KEYS.media),
    ...(eventId ? [mutate(CACHE_KEYS.eventMedia(eventId))] : []),
  ])
}
