'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FolderTree } from '@/components/FolderTree'
import { Loader2, PanelLeft, X } from 'lucide-react'

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const pathname = usePathname()

  // Automatically close the mobile folder drawer after selecting an event/category
  useEffect(() => {
    setPanelOpen(false)
  }, [pathname])

  return (
    <div className="-m-4 sm:-m-6 md:-m-8 flex min-h-full">
      {/* ── Mobile overlay backdrop ── */}
      {panelOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Folder tree panel */}
      <aside className={`
        border-r border-slate-800/70 shrink-0 bg-slate-950 overflow-y-auto
        /* Desktop: always visible, fixed width */
        md:w-72 md:block md:z-auto md:h-[calc(100dvh-4rem)] md:sticky md:top-0
        /* Mobile: off-canvas drawer toggled by button */
        fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transition-transform duration-200
        ${panelOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 md:hidden">
          <span className="text-sm font-semibold text-white">Event Library</span>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close Event Library"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <Suspense fallback={
          <div className="flex justify-center items-center h-32">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        }>
          <FolderTree />
        </Suspense>
      </aside>

      {/* Page content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 min-h-full">
        {/* Mobile library toggle button */}
        <button
          onClick={() => setPanelOpen(true)}
          className="md:hidden mb-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl
                     bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200
                     hover:bg-slate-800 transition-colors"
        >
          <PanelLeft className="w-4 h-4" />
          Event Hierarchy
        </button>

        {children}
      </div>
    </div>
  )
}
