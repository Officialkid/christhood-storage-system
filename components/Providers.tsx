'use client'

import React from 'react'
import { SessionProvider }     from 'next-auth/react'
import { ToastProvider }       from '@/lib/toast'
import { ShareUploadProvider } from '@/contexts/ShareUploadContext'
import { ThemeProvider }       from '@/contexts/ThemeContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <ShareUploadProvider>
            {children}
          </ShareUploadProvider>
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
