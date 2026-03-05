'use client'

import { Suspense }              from 'react'
import { useSession }            from 'next-auth/react'
import { NotificationBell }      from './NotificationBell'
import { SearchBar }             from './SearchBar'

export function TopBar() {
  const { data } = useSession()

  return (
    <header className="flex items-center justify-between px-8 py-3
                       border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
      {/* Centre — persistent search bar */}
      <div className="flex-1 flex justify-center px-4">
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
