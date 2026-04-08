import { Metadata } from 'next'
import { Suspense }  from 'react'
import BatchDownloadClient from './BatchDownloadClient'

export const metadata: Metadata = {
  title: 'Shared Files — Christhood ShareLink',
}

export default function BatchPage({
  searchParams,
}: {
  searchParams: { tokens?: string }
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    }>
      <BatchDownloadClient tokens={searchParams.tokens ?? ''} />
    </Suspense>
  )
}
