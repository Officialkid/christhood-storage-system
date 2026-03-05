'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard, Image, Upload, CalendarDays, Shield, LogOut, Network, ScrollText, Trash2, Bell, Settings, Search, BarChart2,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Media',        href: '/media',        icon: Image           },
  { label: 'Upload',       href: '/upload',       icon: Upload          },
  { label: 'Events',       href: '/events',       icon: CalendarDays    },
  { label: 'Search',       href: '/search',       icon: Search          },
  { label: 'Notifications', href: '/notifications', icon: Bell           },
]

export function Sidebar() {
  const pathname  = usePathname()
  const { data }  = useSession()
  const isAdmin   = data?.user?.role === 'ADMIN'

  return (
    <aside className="flex flex-col w-64 bg-slate-950 border-r border-slate-800/70 shrink-0">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-slate-800/70">
        <h1 className="text-lg font-bold text-white tracking-tight">
          Christhood <span className="bg-gradient-to-r from-indigo-400 to-violet-400
                                       bg-clip-text text-transparent">CMMS</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Ministry Media System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${active
                  ? 'bg-indigo-600/90 text-white shadow-sm shadow-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        {/* Admin-only items */}
        {isAdmin && (
          <>
            <div className="my-2 mx-3 h-px bg-slate-800/70" />
            {[
              { label: 'User Management', href: '/admin/users',     icon: Shield     },
              { label: 'Hierarchy',       href: '/admin/hierarchy', icon: Network    },
              { label: 'Activity Log',    href: '/admin/logs',      icon: ScrollText },
              { label: 'Trash',           href: '/admin/trash',     icon: Trash2     },
              { label: 'Analytics',       href: '/admin/analytics', icon: BarChart2  },
              { label: 'Settings',        href: '/admin/settings',  icon: Settings   },
            ].map(({ label, href, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${active
                      ? 'bg-violet-600/80 text-white shadow-sm shadow-violet-500/20'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-800/70">
        {data?.user && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-white truncate">
              {data.user.username ?? data.user.name ?? data.user.email}
            </p>
            <p className="text-xs text-slate-500 truncate">{data.user.role}</p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 rounded-xl bg-slate-800/60 hover:bg-slate-800
                     px-3 py-2 text-sm text-slate-400 hover:text-white transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
