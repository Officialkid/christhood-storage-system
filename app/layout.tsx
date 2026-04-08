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
    // Prevent phone number detection on iOS
    'format-detection': 'telephone=no',
    // Chrome's modern equivalent of apple-mobile-web-app-capable (silences deprecation warning)
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
