import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?:  string
}

interface Props {
  items:    BreadcrumbItem[]
  homeHref?: string
}

export function Breadcrumb({ items, homeHref = '/events' }: Props) {
  return (
    <nav
      aria-label="breadcrumb"
      className="flex items-center gap-1 text-sm flex-wrap"
    >
      <Link
        href={homeHref}
        className="text-slate-500 hover:text-slate-300 transition flex items-center"
        title="Event Library"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>

      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="text-slate-400 hover:text-white transition"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-white font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
