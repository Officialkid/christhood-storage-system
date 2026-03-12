'use client'

import { Suspense, useState } from 'react'
import { FolderTree } from '@/components/FolderTree'
import { Loader2, PanelLeft, X } from 'lucide-react'

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <div className="-m-8 flex min-h-full">
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
        md:static md:w-72 md:block md:z-auto md:h-screen md:sticky md:top-0
        /* Mobile: off-canvas drawer toggled by button */
        fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-200
        ${panelOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 md:hidden">
          <span className="text-sm font-semibold text-white">Event Library</span>
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
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
      <div className="flex-1 overflow-y-auto p-8 min-h-full">
        {/* Mobile library toggle button */}
        <button
          onClick={() => setPanelOpen(true)}
          className="md:hidden mb-4 flex items-center gap-2 px-3 py-2 rounded-xl
                     bg-slate-800/80 border border-slate-700 text-sm text-slate-200
                     hover:bg-slate-800 transition-colors"
        >
          <PanelLeft className="w-4 h-4" />
          Event Library
        </button>

        {children}
      </div>
    </div>
  )
}
