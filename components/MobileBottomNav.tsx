'use client'

import Link                 from 'next/link'
import { usePathname }      from 'next/navigation'
import { useSession }       from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Image, MessagesSquare, Bell, Menu,
} from 'lucide-react'
import { useSidebar }       from './DashboardShell'

/**
 * MobileBottomNav — fixed bottom navigation bar visible only on mobile devices (< md breakpoint).
 * Provides quick access to the most important sections including the Communications Hub
 * with a combined badge showing unread messages + pending transfers.
 */
export function MobileBottomNav() {
  const pathname             = usePathname()
  const { data: session }    = useSession()
  const { toggleMobile }     = useSidebar()

  const [badge,    setBadge]    = useState(0)
  const [hasUrgent, setHasUrgent] = useState(false)

  const fetchCounts = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res  = await fetch('/api/communications/counts')
      if (!res.ok) return
      const data = await res.json()
      setBadge((data.transfersCount ?? 0) + (data.messagesCount ?? 0))
      setHasUrgent(data.hasUrgent ?? false)
    } catch { /* ignore */ }
  }, [session?.user?.id])

  useEffect(() => {
    fetchCounts()
    const id = setInterval(fetchCounts, 60_000)
    return () => clearInterval(id)
  }, [fetchCounts])

  useEffect(() => {
    const handler = () => fetchCounts()
    window.addEventListener('messagemarkedread', handler)
    return () => window.removeEventListener('messagemarkedread', handler)
  }, [fetchCounts])

  const isComms = pathname.startsWith('/communications') ||
                  pathname.startsWith('/transfers')       ||
                  pathname.startsWith('/messages')

  const navCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium
     transition-colors select-none ${active ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40
                    bg-slate-950/95 backdrop-blur-sm border-t border-slate-800/70
                    flex items-stretch h-16 safe-pb">

      {/* Dashboard */}
      <Link
        href="/dashboard"
        className={navCls(pathname === '/dashboard')}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span>Home</span>
      </Link>

      {/* Media */}
      <Link
        href="/media"
        className={navCls(pathname.startsWith('/media'))}
      >
        <Image className="w-5 h-5" />
        <span>Media</span>
      </Link>

      {/* Communications — primary action */}
      <Link
        href="/communications"
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5
                    text-[10px] font-medium transition-colors select-none relative
                    ${isComms ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
      >
        <span className="relative">
          <MessagesSquare className="w-5 h-5" />
          {badge > 0 && (
            <span className={`absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center
                              rounded-full px-0.5 text-[9px] font-bold text-white leading-none
                              ${hasUrgent ? 'bg-red-500' : 'bg-indigo-500'}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span>Comms</span>
      </Link>

      {/* Notifications */}
      <Link
        href="/notifications"
        className={navCls(pathname.startsWith('/notifications'))}
      >
        <Bell className="w-5 h-5" />
        <span>Alerts</span>
      </Link>

      {/* Menu — opens the sidebar overlay */}
      <button
        onClick={toggleMobile}
        className={navCls(false)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
        <span>Menu</span>
      </button>
    </nav>
  )
}
