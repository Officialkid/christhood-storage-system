import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Christhood Media Gallery',
  description: 'Browse photo galleries from Christhood ministry events and services.',
  icons: {
    shortcut: '/icons/icon-192.svg',
    apple:    '/icons/apple-touch-icon.svg',
    icon: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor:   '#000000',
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
}

export default function GalleryPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      {children}
    </div>
  )
}
