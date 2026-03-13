// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/telemetry.ts
//
// Shared in-memory store for assistant observability.
// All state lives at module level so it is shared across every request in the
// same Node.js process. State resets on server restart — acceptable for a
// 20-person internal tool.
//
// Exports consumed by:
//   - app/api/assistant/route.ts         (write: record requests / errors)
//   - app/api/admin/assistant/stats/route.ts  (read: return stats to UI)
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorType =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'SAFETY_FILTER'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'BAD_REQUEST'
  | 'UNKNOWN'

export interface ErrorLogEntry {
  id:         string
  timestamp:  string   // ISO
  errorType:  ErrorType
  userId:     string
  userName:   string
  message:    string   // the message returned to the user
}

export interface DailyStats {
  date:              string  // YYYY-MM-DD
  totalRequests:     number
  errorCount:        number
  totalDurationMs:   number  // sum, divide by totalRequests for average
  uniqueUserIds:     Set<string>
  rateLimitedHits:   number  // count of 429 responses sent (user-side limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit store (moved here from the route so the admin panel can read it)
// ─────────────────────────────────────────────────────────────────────────────
export const RATE_LIMIT_MAX    = 30
export const RATE_LIMIT_WINDOW = 60 * 60 * 1000  // 1 hour ms

export interface RateEntry {
  userId:      string
  userName:    string
  count:       number
  windowStart: number
}

// Map<userId, RateEntry>
export const rateLimitStore = new Map<string, RateEntry>()

export function checkRateLimit(
  userId:   string,
  userName: string,
): { allowed: boolean; remaining: number } {
  const now   = Date.now()
  const entry = rateLimitStore.get(userId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(userId, { userId, userName, count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error log — circular, capped at 50 entries
// ─────────────────────────────────────────────────────────────────────────────
const ERROR_LOG_MAX = 50
const errorLog: ErrorLogEntry[] = []

export function recordError(
  userId:    string,
  userName:  string,
  errorType: ErrorType,
  message:   string,
) {
  const entry: ErrorLogEntry = {
    id:        crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    errorType,
    userId,
    userName,
    message,
  }
  errorLog.unshift(entry)   // newest first
  if (errorLog.length > ERROR_LOG_MAX) errorLog.pop()
}

export function getErrorLog(): ErrorLogEntry[] {
  return errorLog.slice(0, 10)   // return last 10 for the UI
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily usage stats
// ─────────────────────────────────────────────────────────────────────────────
let dailyStats: DailyStats = createFreshStats()

function todayKey() {
  return new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
}

function createFreshStats(): DailyStats {
  return {
    date:            todayKey(),
    totalRequests:   0,
    errorCount:      0,
    totalDurationMs: 0,
    uniqueUserIds:   new Set(),
    rateLimitedHits: 0,
  }
}

function ensureToday() {
  if (dailyStats.date !== todayKey()) {
    dailyStats = createFreshStats()
  }
}

export function recordRequest(opts: {
  userId:      string
  durationMs:  number
  hadError:    boolean
  errorType?:  ErrorType
  userName?:   string
  errorMsg?:   string
  rateLimited: boolean
}) {
  ensureToday()

  dailyStats.totalRequests++
  dailyStats.totalDurationMs += opts.durationMs
  dailyStats.uniqueUserIds.add(opts.userId)

  if (opts.rateLimited) {
    dailyStats.rateLimitedHits++
  }

  if (opts.hadError && opts.errorType) {
    dailyStats.errorCount++
    recordError(
      opts.userId,
      opts.userName ?? opts.userId,
      opts.errorType,
      opts.errorMsg ?? 'Unknown error',
    )
  }
}

export function getStats() {
  ensureToday()
  const s = dailyStats
  const avgMs = s.totalRequests > 0
    ? Math.round(s.totalDurationMs / s.totalRequests)
    : 0
  const errorRate = s.totalRequests > 0
    ? Math.round((s.errorCount / s.totalRequests) * 100)
    : 0

  return {
    date:              s.date,
    totalRequests:     s.totalRequests,
    errorCount:        s.errorCount,
    uniqueUsers:       s.uniqueUserIds.size,
    avgResponseMs:     avgMs,
    errorRatePct:      errorRate,
    rateLimitedHits:   s.rateLimitedHits,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit status for the admin panel
// ─────────────────────────────────────────────────────────────────────────────
export function getRateLimitStatus() {
  const now = Date.now()
  const active: Array<{
    userId:      string
    userName:    string
    count:       number
    remaining:   number
    resetsAt:    string  // ISO
    isMaxed:     boolean
  }> = []

  for (const [, entry] of rateLimitStore) {
    // Skip entries whose window has already expired
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) continue

    const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count)
    active.push({
      userId:    entry.userId,
      userName:  entry.userName,
      count:     entry.count,
      remaining,
      resetsAt:  new Date(entry.windowStart + RATE_LIMIT_WINDOW).toISOString(),
      isMaxed:   remaining === 0,
    })
  }

  // Sort: maxed-out users first, then by usage descending
  active.sort((a, b) => {
    if (a.isMaxed !== b.isMaxed) return a.isMaxed ? -1 : 1
    return b.count - a.count
  })

  return {
    totalTracked: active.length,
    maxedOut:     active.filter(u => u.isMaxed).length,
    users:        active,
  }
}
