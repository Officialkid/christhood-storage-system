'use client'

import Link                 from 'next/link'
import { usePathname }      from 'next/navigation'
import { useSession }       from 'next-auth/react'
import {
  LayoutDashboard, CalendarDays, Upload, ArrowLeftRight, Image,
} from 'lucide-react'
import { useUnreadCount }   from '@/hooks/useUnreadCount'
import { CommsBadgeSmall }  from './CommsBadge'

/**
 * MobileBottomNav — fixed bottom navigation bar visible only on mobile devices (< md breakpoint).
 * Provides 1-tap thumb access to Home, Events, +Upload (prominent center CTA), Transfers, and Media.
 */
export function MobileBottomNav() {
  const pathname          = usePathname()
  const { data: session } = useSession()

  const { total: badge, urgent: hasUrgent } = useUnreadCount({
    skip: !session?.user?.id,
  })

  const isTransfers =
    pathname.startsWith('/communications') ||
    pathname.startsWith('/transfers')
  const isUpload = pathname.startsWith('/upload')

  const navCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[11px] font-medium
     transition-colors select-none min-h-[3.5rem] ${
       active ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
     }`

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40
                 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80
                 flex items-center min-h-[4rem] safe-pb px-1"
    >
      {/* Home */}
      <Link
        href="/dashboard"
        className={navCls(pathname === '/dashboard')}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span>Home</span>
      </Link>

      {/* Events */}
      <Link
        href="/events"
        className={navCls(pathname.startsWith('/events'))}
      >
        <CalendarDays className="w-5 h-5" />
        <span>Events</span>
      </Link>

      {/* + Upload — prominent center action */}
      <Link
        href="/upload"
        aria-label="Upload media"
        className="flex-1 flex flex-col items-center justify-center py-1.5 select-none"
      >
        <span
          className={`flex items-center justify-center w-11 h-9 rounded-2xl shadow-md transition-transform active:scale-95 ${
            isUpload
              ? 'bg-indigo-500 text-white ring-2 ring-indigo-400/50'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/25'
          }`}
        >
          <Upload className="w-4 h-4" />
        </span>
        <span
          className={`text-[10px] font-semibold mt-0.5 ${
            isUpload ? 'text-indigo-400' : 'text-slate-300'
          }`}
        >
          Upload
        </span>
      </Link>

      {/* Transfers */}
      <Link
        href="/communications/transfers/inbox"
        className={`${navCls(isTransfers)} relative`}
      >
        <span className="relative">
          <ArrowLeftRight className="w-5 h-5" />
          <CommsBadgeSmall count={badge} urgent={hasUrgent} />
        </span>
        <span>Transfers</span>
      </Link>

      {/* Media */}
      <Link
        href="/media"
        className={navCls(pathname.startsWith('/media'))}
      >
        <Image className="w-5 h-5" />
        <span>Media</span>
      </Link>
    </nav>
  )
}
