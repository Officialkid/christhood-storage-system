import { Suspense } from 'react'
import { FolderTree } from '@/components/FolderTree'
import { Loader2 } from 'lucide-react'

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-8 flex min-h-full">
      {/* Folder tree panel */}
      <aside className="w-72 border-r border-slate-800/70 shrink-0 sticky top-0 h-screen overflow-y-auto bg-slate-950">
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
        {children}
      </div>
    </div>
  )
}
