/**
 * lib/rate-limit.ts
 * Upstash Redis–backed IP rate limiter for the login endpoint.
 *
 * Layer 1 of the brute-force defence stack:
 *   - Max 5 credential login attempts per IP within any 15-minute sliding window
 *   - Uses Upstash's REST API (works on Vercel Edge + Node.js runtimes)
 *
 * Graceful degradation: if UPSTASH_REDIS_REST_URL / _TOKEN are not set,
 * all checks return { limited: false } so local dev is unaffected.
 *
 * Required env vars (add to .env.local and Vercel project settings):
 *   UPSTASH_REDIS_REST_URL   — from console.upstash.com → your database → REST API
 *   UPSTASH_REDIS_REST_TOKEN — same place, "Read-Write Token"
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

const isConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
)

let ipLimiter:       Ratelimit | null = null
let registerLimiter: Ratelimit | null = null
let forgotLimiter:   Ratelimit | null = null

if (isConfigured) {
  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })

  ipLimiter = new Ratelimit({
    redis,
    // 5 attempts allowed in any rolling 15-minute window
    limiter:   Ratelimit.slidingWindow(5, '15 m'),
    prefix:    'christhood:rl:login:ip',
    analytics: false,
  })

  registerLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(3, '15 m'),
    prefix:    'christhood:rl:register:ip',
    analytics: false,
  })

  forgotLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(3, '15 m'),
    prefix:    'christhood:rl:forgot:ip',
    analytics: false,
  })
}

export interface RateLimitResult {
  limited:    boolean
  /** Seconds until the oldest attempt falls out of the window. 0 when not limited. */
  retryAfter: number
}

/**
 * Check whether an IP address has exceeded the login rate limit.
 * Returns { limited: false, retryAfter: 0 } when Upstash is not configured —
 * this ensures local dev and non-Upstash deployments are unblocked.
 */
export async function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
  if (!ipLimiter) return { limited: false, retryAfter: 0 }

  try {
    const { success, reset } = await ipLimiter.limit(ip)
    if (!success) {
      return {
        limited:    true,
        retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      }
    }
  } catch (err) {
    // Redis unavailable — fail open so legitimate users are never permanently blocked
    console.warn('[rate-limit] Upstash call failed, allowing request through:', err)
  }

  return { limited: false, retryAfter: 0 }
}

async function checkLimiter(
  limiter: Ratelimit | null,
  ip: string,
): Promise<RateLimitResult> {
  if (!limiter) return { limited: false, retryAfter: 0 }
  try {
    const { success, reset } = await limiter.limit(ip)
    if (!success) {
      return {
        limited:    true,
        retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      }
    }
  } catch (err) {
    console.warn('[rate-limit] Upstash call failed, allowing request through:', err)
  }
  return { limited: false, retryAfter: 0 }
}

export function checkRegisterRateLimit(ip: string): Promise<RateLimitResult> {
  return checkLimiter(registerLimiter, ip)
}

export function checkForgotPasswordRateLimit(ip: string): Promise<RateLimitResult> {
  return checkLimiter(forgotLimiter, ip)
}
