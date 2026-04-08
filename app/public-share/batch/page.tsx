import { Metadata } from 'next'
import { Suspense }  from 'react'
import BatchDownloadClient from './BatchDownloadClient'

export const metadata: Metadata = {
  title: 'Shared Files — Christhood ShareLink',
}

export default async function BatchPage({
  searchParams,
}: {
  searchParams: Promise<{ tokens?: string }>
}) {
  const { tokens } = await searchParams

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
        <div className="w-8 h-8 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    }>
      <BatchDownloadClient tokens={tokens ?? ''} />
    </Suspense>
  )
}
