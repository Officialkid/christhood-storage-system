'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Image, Upload, CalendarDays, Shield, LogOut, Network, ScrollText,
  Trash2, Bell, Settings, Search, BarChart2, UserCircle, BookOpen, ChevronLeft, ChevronRight,
  MessagesSquare, X,
} from 'lucide-react'
import { useSidebar }       from './DashboardShell'
import { useUnreadCount }   from '@/hooks/useUnreadCount'
import { CommsBadge, CommsBadgeSmall } from './CommsBadge'

type NavItem = { label: string; href: string; icon: React.ElementType; badge?: boolean }

const navItems: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',        icon: LayoutDashboard },
  { label: 'Media',          href: '/media',            icon: Image           },
  { label: 'Upload',         href: '/upload',           icon: Upload          },
  { label: 'Events',         href: '/events',           icon: CalendarDays    },
  { label: 'Search',         href: '/search',           icon: Search          },
  { label: 'Communications', href: '/communications',   icon: MessagesSquare, badge: true },
  { label: 'Notifications',  href: '/notifications',    icon: Bell            },
  { label: 'User Guide',     href: '/docs',             icon: BookOpen        },
]

const adminItems = [
  { label: 'User Management', href: '/admin/users',     icon: Shield              },

  { label: 'Hierarchy',       href: '/admin/hierarchy', icon: Network             },
  { label: 'Activity Log',    href: '/admin/logs',      icon: ScrollText          },
  { label: 'Trash',           href: '/admin/trash',     icon: Trash2              },
  { label: 'Analytics',       href: '/admin/analytics', icon: BarChart2           },
  { label: 'Settings',        href: '/admin/settings',  icon: Settings            },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data } = useSession()
  const isAdmin  = data?.user?.role === 'ADMIN'
  const { mobileOpen, closeMobile } = useSidebar()

  const [collapsed, setCollapsed] = useState(false)
  const [mounted,   setMounted]   = useState(false)

  const { total: commsCount, urgent: commsUrgent } = useUnreadCount({
    baseTitle: 'Christhood CMMS',
    skip:      !data?.user?.id,
  })

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c))
      return !c
    })
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
        ${isCollapsed ? 'md:w-16' : 'md:w-64'}
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
        {navItems.map(({ label, href, icon: Icon, badge }) => {
          const active       = pathname.startsWith(href)
          const badgeCount   = badge ? commsCount : 0
          const badgeUrgent  = badge ? commsUrgent : false
          return (
            <Link
              key={href}
              href={href}
              title={isCollapsed ? label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-all
                ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'}
                ${active
                  ? 'bg-indigo-600/90 text-white shadow-sm shadow-indigo-500/20'
                  : 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
                }`}
            >
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
