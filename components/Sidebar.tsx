'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Image, Upload, CalendarDays, Shield, LogOut, Network, ScrollText,
  Trash2, Bell, Settings, Search, BarChart2, UserCircle, BookOpen, ChevronLeft, ChevronRight,
  MessagesSquare, X, Bot, Share2, Tags, GalleryHorizontal, RefreshCcw, Minus, Plus,
} from 'lucide-react'
import { useSidebar }       from './DashboardShell'
import { useUnreadCount }   from '@/hooks/useUnreadCount'
import { CommsBadge, CommsBadgeSmall } from './CommsBadge'

type NavItem = { label: string; href: string; icon: React.ElementType; badge?: boolean; external?: boolean }

const navItems: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',        icon: LayoutDashboard },
  { label: 'Media',          href: '/media',            icon: Image           },
  { label: 'Upload',         href: '/upload',           icon: Upload          },
  { label: 'Galleries',      href: '/galleries',        icon: GalleryHorizontal },
  { label: 'Events',         href: '/events',           icon: CalendarDays    },
  { label: 'Search',         href: '/search',           icon: Search          },
  { label: 'Communications', href: '/communications',   icon: MessagesSquare, badge: true },
  { label: 'Notifications',  href: '/notifications',    icon: Bell            },
  { label: 'Share a File',   href: 'https://sharelink.cmmschristhood.org', icon: Share2, external: true },
  { label: 'User Guide',     href: '/docs',             icon: BookOpen        },
]

const adminItems = [
  { label: 'User Management', href: '/admin/users',        icon: Shield    },
  { label: 'Hierarchy',       href: '/admin/hierarchy',       icon: Network    },
  { label: 'Event Categories', href: '/admin/event-categories', icon: Tags       },
  { label: 'Activity Log',    href: '/admin/logs',            icon: ScrollText },
  { label: 'Trash',           href: '/admin/trash',        icon: Trash2    },
  { label: 'Share Links',     href: '/admin/share-links',  icon: Share2    },
  { label: 'Analytics',       href: '/admin/analytics',    icon: BarChart2 },
  { label: 'Settings',        href: '/admin/settings',     icon: Settings  },
  { label: 'AI Assistant',    href: '/admin/assistant',    icon: Bot       },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data } = useSession()
  const isAdmin  = data?.user?.role === 'ADMIN'
  const { mobileOpen, closeMobile } = useSidebar()

  const [collapsed, setCollapsed] = useState(false)
  const [sizeMode,  setSizeMode]  = useState<'normal' | 'wide'>('normal')
  const [mounted,   setMounted]   = useState(false)

  const { total: commsCount, urgent: commsUrgent } = useUnreadCount({
    baseTitle: 'Christhood CMMS',
    skip:      !data?.user?.id,
  })

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    const savedSize = localStorage.getItem('sidebar-size')
    if (saved === 'true') setCollapsed(true)
    if (savedSize === 'wide') setSizeMode('wide')
    setMounted(true)
  }, [])

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
  }

  const reduceNavigation = () => {
    if (collapsed) return
    if (sizeMode === 'wide') {
      setSizeMode('normal')
      localStorage.setItem('sidebar-size', 'normal')
      return
    }
    setCollapsed(true)
    localStorage.setItem('sidebar-collapsed', 'true')
  }

  const increaseNavigation = () => {
    if (collapsed) {
      setCollapsed(false)
      localStorage.setItem('sidebar-collapsed', 'false')
      return
    }
    setSizeMode('wide')
    localStorage.setItem('sidebar-size', 'wide')
  }

  // Avoid layout shift on first render — match server default (expanded).
  // On mobile overlay, ALWAYS show labels regardless of desktop collapsed state.
  const isCollapsed = mounted && !mobileOpen ? collapsed : false

  // Close mobile drawer when navigating
  useEffect(() => { closeMobile() }, [pathname, closeMobile])

  return (
    <aside
      data-tour="sidebar"
      className={`
        flex flex-col bg-slate-950 border-r border-slate-800/70 transition-all duration-200
        /* ── Mobile: off-canvas drawer ── */
        fixed inset-y-0 left-0 z-50 w-72 shrink-0
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        /* ── Desktop (md+): inline sidebar, no translate ── */
        md:relative md:inset-auto md:z-auto md:translate-x-0 md:shadow-none
        ${isCollapsed ? 'md:w-16' : sizeMode === 'wide' ? 'md:w-72' : 'md:w-64'}
      `}
    >
      {/* ── Mobile close button — pops outside the sidebar edge ── */}
      {mobileOpen && (
        <button
          onClick={closeMobile}
          aria-label="Close menu"
          className="md:hidden absolute -right-12 top-4 z-50 flex items-center justify-center
                     w-10 h-10 rounded-full bg-slate-800 border border-slate-700 text-white
                     shadow-xl hover:bg-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Toggle button — desktop only, sits at the right edge of the sidebar */}
      <button
        onClick={toggle}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-10 hidden md:flex items-center justify-center w-6 h-6
                   rounded-full bg-slate-800 border border-slate-700 text-white
                   hover:bg-slate-700 transition-colors shadow-md"
      >
        {isCollapsed
          ? <ChevronRight className="w-3.5 h-3.5" />
          : <ChevronLeft  className="w-3.5 h-3.5" />
        }
      </button>

      {/* Brand */}
      <div className={`border-b border-slate-800/70 overflow-hidden transition-all duration-200
        ${isCollapsed ? 'px-2 py-5' : 'px-6 py-6'}`}
      >
        {isCollapsed ? (
          <div className="flex justify-center">
            <span className="text-indigo-400 font-bold text-lg leading-none">C</span>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Christhood{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                CMMS
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Ministry Media System</p>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${isCollapsed ? 'px-1.5' : 'px-3'}`}>
        {navItems.map(({ label, href, icon: Icon, badge, external }) => {
          const active       = !external && pathname.startsWith(href)
          const badgeCount   = badge ? commsCount : 0
          const badgeUrgent  = badge ? commsUrgent : false
          const itemClass    = `flex items-center rounded-xl text-sm font-medium transition-all
            ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'}
            ${active
              ? 'bg-indigo-600/90 text-white shadow-sm shadow-indigo-500/20'
              : 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
            }`
          const content = (
            <>
              <span className="relative shrink-0">
                <Icon className="w-4 h-4 text-current" />
                {isCollapsed && (
                  <CommsBadgeSmall count={badgeCount} urgent={badgeUrgent} />
                )}
              </span>
              {!isCollapsed && label}
              {!isCollapsed && (
                <CommsBadge count={badgeCount} urgent={badgeUrgent} className="ml-auto" />
              )}
            </>
          )
          if (external) {
            return (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                 title={isCollapsed ? label : undefined} className={itemClass}>
                {content}
              </a>
            )
          }
          return (
            <Link key={href} href={href} title={isCollapsed ? label : undefined} className={itemClass}>
              {content}
            </Link>
          )
        })}

        {/* Admin-only items */}
        {isAdmin && (
          <>
            <div className={`my-2 h-px bg-slate-800/70 ${isCollapsed ? 'mx-1' : 'mx-3'}`} />
            {adminItems.map(({ label, href, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  title={isCollapsed ? label : undefined}
                  className={`flex items-center rounded-xl text-sm font-medium transition-all
                    ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'}
                    ${active
                      ? 'bg-violet-600/80 text-white shadow-sm shadow-violet-500/20'
                      : 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-current" />
                  {!isCollapsed && label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className={`border-t border-slate-800/70 ${isCollapsed ? 'px-1.5 py-3' : 'px-4 py-4'}`}>
        <div className={`mb-2 ${isCollapsed ? 'flex justify-center' : 'flex items-center justify-between px-1'} `}>
          {!isCollapsed && <span className="text-[11px] uppercase tracking-wide text-slate-500">Navigation size</span>}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={reduceNavigation}
              disabled={collapsed}
              title="Reduce navigation"
              aria-label="Reduce navigation"
              className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={increaseNavigation}
              disabled={!collapsed && sizeMode === 'wide'}
              title="Increase navigation"
              aria-label="Increase navigation"
              className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {data?.user && (
          <Link
            href="/profile"
            title={isCollapsed ? (data.user.username ?? data.user.name ?? data.user.email ?? 'Profile') : undefined}
            className={`flex items-center mb-2 rounded-xl hover:bg-slate-800/70 transition-colors group
              ${isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2 py-1.5'}`}
          >
            <UserCircle className="w-4 h-4 text-slate-300 group-hover:text-white shrink-0 transition-colors" />
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {data.user.username ?? data.user.name ?? data.user.email}
                </p>
                <p className="text-xs text-slate-500 truncate">{data.user.role}</p>
              </div>
            )}
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login?switched=1' })}
          title={isCollapsed ? 'Switch account' : undefined}
          className={`w-full flex items-center rounded-xl bg-slate-800/60 hover:bg-indigo-600/20
                      py-2 text-sm text-slate-400 hover:text-indigo-300 transition-all mb-1
                      ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-3'}`}
        >
          <RefreshCcw className="w-4 h-4" />
          {!isCollapsed && 'Choose another account'}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title={isCollapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center rounded-xl bg-slate-800/60 hover:bg-slate-800
                      py-2 text-sm text-slate-200 hover:text-white transition-all
                      ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-3'}`}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
