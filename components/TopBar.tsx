'use client'

import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { NotificationBell } from './NotificationBell'
import { NetworkStatus } from './NetworkStatus'
import { SearchBar } from './SearchBar'
import { useSidebar } from './DashboardShell'
import { Menu, Sparkles } from 'lucide-react'

function getPageMeta(pathname: string) {
  if (pathname.startsWith('/communications/transfers')) {
    return {
      label: 'Transfers',
      hint: 'Share, receive, and track files from one place',
    }
  }

  if (pathname.startsWith('/communications/messages')) {
    return {
      label: 'Messages',
      hint: 'Keep conversations and notices easy to follow',
    }
  }

  if (pathname.startsWith('/admin/settings')) {
    return {
      label: 'System Settings',
      hint: 'Manage the system safely from one page',
    }
  }

  if (pathname.startsWith('/admin/assistant')) {
    return {
      label: 'AI Assistant',
      hint: 'Monitor Zara, tools, and assistant health',
    }
  }

  if (pathname.startsWith('/admin/analytics')) {
    return {
      label: 'Analytics',
      hint: 'Understand storage, activity, and usage quickly',
    }
  }

  if (pathname.startsWith('/admin/users')) {
    return {
      label: 'User Management',
      hint: 'Manage roles, access, and user status',
    }
  }

  if (pathname.startsWith('/dashboard')) {
    return {
      label: 'Dashboard',
      hint: 'Your quick overview of the ministry media system',
    }
  }

  return {
    label: 'Christhood CMMS',
    hint: 'Simple media management for everyday users',
  }
}

export function TopBar() {
  const { data } = useSession()
  const pathname = usePathname()
  const { toggleMobile } = useSidebar()
  const pageMeta = getPageMeta(pathname)
  const userLabel = data?.user?.username ?? data?.user?.name ?? data?.user?.email

  return (
    <header
      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6
                 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={toggleMobile}
          aria-label="Open navigation"
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg
                     text-slate-400 transition-colors hover:bg-slate-800 hover:text-white shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 md:block">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{pageMeta.label}</p>
              <p className="truncate text-xs text-slate-500">{pageMeta.hint}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 justify-center px-2 sm:px-4">
        <Suspense fallback={null}>
          <div className="w-full max-w-2xl">
            <SearchBar />
          </div>
        </Suspense>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1.5">
          <NetworkStatus />
        </div>

        {userLabel && (
          <div className="hidden lg:flex items-center rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5">
            <span className="max-w-[180px] truncate text-sm text-slate-400">
              {userLabel}
            </span>
          </div>
        )}

        <NotificationBell />
      </div>
    </header>
  )
}
