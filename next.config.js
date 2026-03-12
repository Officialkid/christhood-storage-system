/** @type {import('next').NextConfig} */

/**
 * Sanitise a URL env-var that may have been entered incorrectly in the
 * hosting dashboard (e.g. "https:// https://example.com" — double protocol
 * or leading whitespace). We extract the last valid http(s) URL from the
 * string so the build never crashes with ERR_INVALID_URL.
 */
function sanitiseUrl(raw) {
  if (!raw) return raw
  const trimmed = raw.trim()
  // If it looks like a valid URL already, return as-is
  try { new URL(trimmed); return trimmed } catch (_) { /* fall through */ }
  // Otherwise pull the last https?://... segment out of a garbled string
  const match = trimmed.match(/https?:\/\/\S+/)
  return match ? match[0] : trimmed
}

// ─── Sanitise process.env in-place so server-side SSG code also gets the
// cleaned values (Next.js `env` block only covers client-bundle replacements).
for (const key of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
  if (process.env[key]) {
    process.env[key] = sanitiseUrl(process.env[key])
  }
}

const nextConfig = {
  // Produce a self-contained build in .next/standalone/ — required for Docker
  output: 'standalone',

  // ── Information disclosure hardening ──────────────────────────────────────
  // Remove the "X-Powered-By: Next.js" header from all responses.
  // Revealing the framework name + version helps attackers narrow their attack
  // surface. This is a zero-cost, zero-risk change.
  poweredByHeader: false,

  // Sanitise URL env-vars at build-time so a mis-typed value in the hosting
  // dashboard (e.g. "https:// https://…") never crashes static-page generation.
  env: {
    NEXTAUTH_URL:        sanitiseUrl(process.env.NEXTAUTH_URL),
    NEXT_PUBLIC_APP_URL: sanitiseUrl(process.env.NEXT_PUBLIC_APP_URL),
  },

  reactStrictMode: true,
  webpack: (config) => {
    // Prevent ffmpeg packages from being bundled at build time;
    // they are only needed at serverless function runtime.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      '@ffmpeg-installer/ffmpeg',
      'fluent-ffmpeg',
    ]
    return config
  },
  // Ensure the service worker can control the full origin (scope = '/')
  async headers() {
    // Security headers applied to every page and API route as a third layer
    // of defence (vercel.json → middleware.ts → next.config.js).
    const securityHeaders = [
      { key: 'Strict-Transport-Security',  value: 'max-age=31536000; includeSubDomains; preload' },
      {
        key:   'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https: blob:",
          "media-src 'self' https: blob:",
          "connect-src 'self' https://*.r2.cloudflarestorage.com https://api.anthropic.com",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "base-uri 'self'",
        ].join('; '),
      },
      { key: 'X-Frame-Options',           value: 'DENY' },
      { key: 'X-Content-Type-Options',    value: 'nosniff' },
      { key: 'X-XSS-Protection',          value: '1; mode=block' },
      { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',        value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
    ]

    return [
      // Apply security headers to all routes except static assets
      {
        source: '/((?!_next/static|_next/image|favicon\.ico).*)',
        headers: securityHeaders,
      },
      // Service worker needs its own Cache-Control and scope headers in addition
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control',          value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ]
  },}

module.exports = nextConfig
