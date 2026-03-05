/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return [
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
