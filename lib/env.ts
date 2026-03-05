/**
 * lib/env.ts — Server-side environment variable validation
 *
 * This module validates every required environment variable at startup.
 * It is imported by instrumentation.ts, which Next.js runs once when the
 * Node.js server boots — before any HTTP request is processed.
 *
 * If a required variable is missing:
 *   • The module throws immediately with a clear, readable error message
 *   • The server does not start (or the container crashes and restarts)
 *   • You see the exact variable name in the logs right away
 *
 * NEVER import this file in client-side code. The secrets it validates
 * must not be included in the browser bundle.
 * Use the individual `process.env.NEXT_PUBLIC_*` references for client code.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helper: throw a clean error for a missing variable
// ─────────────────────────────────────────────────────────────────────────────
function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(
      `\n` +
      `╔══════════════════════════════════════════════════════════╗\n` +
      `║           MISSING ENVIRONMENT VARIABLE                  ║\n` +
      `╠══════════════════════════════════════════════════════════╣\n` +
      `║  ${name.padEnd(56)}║\n` +
      `╠══════════════════════════════════════════════════════════╣\n` +
      `║  Local dev:   add it to your .env file                  ║\n` +
      `║  Production:  add it in your platform's env dashboard   ║\n` +
      `║               or in the .env file on your server        ║\n` +
      `╚══════════════════════════════════════════════════════════╝`
    )
  }
  return value
}

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) return defaultValue
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed)) {
    throw new Error(
      `[env] "${name}" must be an integer. Got: "${raw}"`
    )
  }
  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// Validated, typed environment — import this instead of process.env directly
// ─────────────────────────────────────────────────────────────────────────────
export const env = {
  // ── Database ──────────────────────────────────────────────────────────────
  // Full Prisma connection string.
  // Docker Compose: host MUST be "db" (the service name), not "localhost"
  //   postgresql://USER:PASS@db:5432/DBNAME
  // Local dev (outside Docker):  replace "db" with "localhost"
  DATABASE_URL: required('DATABASE_URL'),

  // ── NextAuth.js ───────────────────────────────────────────────────────────
  // Random 32-byte secret used to sign session cookies and JWTs.
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  // Or:       openssl rand -base64 32
  NEXTAUTH_SECRET: required('NEXTAUTH_SECRET'),

  // The canonical public URL of this app — no trailing slash.
  // Used by NextAuth to build callback redirect URLs.
  NEXTAUTH_URL: required('NEXTAUTH_URL'),

  // ── Cloudflare R2 ─────────────────────────────────────────────────────────
  // Found in the Cloudflare dashboard → R2 → Overview → Account ID
  CLOUDFLARE_R2_ACCOUNT_ID: required('CLOUDFLARE_R2_ACCOUNT_ID'),

  // R2 API token keys — created under R2 → Manage API Tokens
  CLOUDFLARE_R2_ACCESS_KEY_ID:     required('CLOUDFLARE_R2_ACCESS_KEY_ID'),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: required('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),

  // The name of the bucket where media files are stored
  CLOUDFLARE_R2_BUCKET_NAME: required('CLOUDFLARE_R2_BUCKET_NAME'),

  // ── Resend ────────────────────────────────────────────────────────────────
  // API key from resend.com → API Keys (prefix: re_)
  RESEND_API_KEY: required('RESEND_API_KEY'),

  // The sender address for all outgoing emails — must be a verified domain in Resend
  FROM_EMAIL: required('FROM_EMAIL'),

  // ── Web Push (VAPID) ──────────────────────────────────────────────────────
  // Generate once: npx web-push generate-vapid-keys
  // The public key is also read by lib/webpush.ts and api/push/vapid-key/route.ts
  // using process.env.VAPID_PUBLIC_KEY directly (no NEXT_PUBLIC_ prefix needed
  // because it is served via /api/push/vapid-key, not bundled client-side).
  VAPID_PUBLIC_KEY:  required('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: required('VAPID_PRIVATE_KEY'),

  // ── Public app URL ────────────────────────────────────────────────────────
  // Used in email links, push notification click_action, and OG meta.
  // Must match NEXTAUTH_URL in most deployments.
  NEXT_PUBLIC_APP_URL: required('NEXT_PUBLIC_APP_URL'),

  // ── Configurable automation thresholds (optional, with safe defaults) ─────
  // How many months after creation before a file is auto-archived.
  // Override by setting ARCHIVE_THRESHOLD_MONTHS in your .env file.
  ARCHIVE_THRESHOLD_MONTHS: optionalInt('ARCHIVE_THRESHOLD_MONTHS', 6),

  // How many days a file stays in trash before being permanently purged.
  // Override by setting TRASH_RETENTION_DAYS in your .env file.
  TRASH_RETENTION_DAYS: optionalInt('TRASH_RETENTION_DAYS', 30),
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Log confirmation when all checks pass
// ─────────────────────────────────────────────────────────────────────────────
console.log('[env] All required environment variables are present ✓')
console.log(`[env] Archive threshold : ${env.ARCHIVE_THRESHOLD_MONTHS} months`)
console.log(`[env] Trash retention   : ${env.TRASH_RETENTION_DAYS} days`)
