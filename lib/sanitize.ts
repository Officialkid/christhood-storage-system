/**
 * Approach 3 — Input sanitization utility (CRLF injection fix)
 *
 * Import sanitizePath() in any API route that echoes back URL parameters,
 * path segments, or other user-controlled strings into response headers,
 * filenames, or Content-Disposition values.
 *
 * @example
 *   import { sanitizePath } from '@/lib/sanitize'
 *
 *   // In an API route that reflects a user-supplied slug:
 *   const safeSlug = sanitizePath(params.slug)
 *   res.headers.set('X-Resource-Path', safeSlug)
 */

/** Matches raw CR/LF bytes and both-case percent-encoded forms (%0d %0a %0D %0A). */
const CRLF_SANITIZE_RE = /[\r\n]|%0[da]/gi

/**
 * Removes all CRLF characters (raw and percent-encoded) from a string.
 *
 * Use on any user-controlled value before it is written into:
 *   - HTTP response headers
 *   - Content-Disposition filenames
 *   - Log entries (to prevent log injection)
 *   - Any other context where newlines would be significant
 */
export function sanitizePath(input: string): string {
  return input.replace(CRLF_SANITIZE_RE, '')
}
