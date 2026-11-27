import type { Metadata, Viewport } from 'next'
import { Providers }       from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Christhood CMMS – Media Management',
  description: 'Centralized Media Management System for the Christhood ministry team',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Christhood CMMS',
  },
  icons: {
    shortcut: '/icons/icon-192.svg',
    apple: '/icons/apple-touch-icon.svg',
    icon:  [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  },
  other: {
    'format-detection': 'telephone=no',
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('cmms-theme') || 'system';
    var resolved = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
