'use client'

import { Suspense }         from 'react'
import { useSession }       from 'next-auth/react'
import { NotificationBell } from './NotificationBell'
import { SearchBar }        from './SearchBar'
import { useSidebar }       from './DashboardShell'
import { Menu }             from 'lucide-react'

export function TopBar() {
  const { data }        = useSession()
  const { toggleMobile } = useSidebar()

  return (
    <header className="flex items-center justify-between px-4 sm:px-8 py-3
                       border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
      {/* Mobile menu button — only visible below md */}
      <button
        onClick={toggleMobile}
        aria-label="Open navigation"
        className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg
                   text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Centre — persistent search bar */}
      <div className="flex-1 flex justify-center px-2 sm:px-4">
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-3 shrink-0">
        {data?.user && (
          <span className="hidden sm:block text-sm text-slate-500">
            {data.user.username ?? data.user.name ?? data.user.email}
          </span>
        )}
        <NotificationBell />
      </div>
    </header>
  )
}
