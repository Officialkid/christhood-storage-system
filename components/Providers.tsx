'use client'

import React from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider }   from '@/lib/toast'
import { ShareUploadProvider } from '@/contexts/ShareUploadContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ShareUploadProvider>
          {children}
        </ShareUploadProvider>
      </ToastProvider>
    </SessionProvider>
  )
}
