'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  ChevronRight, ChevronDown, Calendar, FolderOpen, FolderClosed,
  Image, Loader2, RefreshCw,
} from 'lucide-react'
import { SWR_CONFIG } from '@/lib/cache'
import type { HierarchyYear, HierarchyCategory, HierarchyEvent } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── helpers ────────────────────────────────────────────────────

function countEvents(year: HierarchyYear) {
  return year.categories.reduce((s, c) => s + c.events.length, 0)
}

function badge(n: number) {
  if (!n) return null
  return (
    <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5
                     rounded-full bg-slate-700/80 text-slate-400">
      {n}
    </span>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function SubfolderRow({
  sf, eventId, activeSubfolderId,
}: {
  sf: { id: string; label: string; _count?: { mediaFiles: number } }
  eventId: string
  activeSubfolderId?: string
}) {
  const active = sf.id === activeSubfolderId
  return (
    <Link
      href={`/events/${eventId}?subfolder=${sf.id}`}
      className={`flex items-center gap-2 pl-10 pr-3 py-1.5 rounded-lg text-xs transition-all
        ${active
          ? 'bg-indigo-600/80 text-white font-medium'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
        }`}
    >
      <FolderOpen className="w-3 h-3 shrink-0" />
      <span className="truncate">{sf.label}</span>
      {badge(sf._count?.mediaFiles ?? 0)}
    </Link>
  )
}

function EventRow({
  event, activeEventId, activeSubfolderId, defaultOpen,
}: {
  event: HierarchyEvent
  activeEventId?: string
  activeSubfolderId?: string
  defaultOpen?: boolean
}) {
  const isActive = event.id === activeEventId
  const [open, setOpen] = useState(defaultOpen ?? isActive)
  const hasSubs = event.subfolders.length > 0
  const dateStr = new Date(event.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div>
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs group
                       transition-all cursor-pointer
                       ${isActive && !activeSubfolderId
                         ? 'bg-indigo-600/80 text-white font-medium'
                         : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                       }`}>
        {/* collapse toggle */}
        {hasSubs
          ? (
            <button
              onClick={() => setOpen(v => !v)}
              className="shrink-0 text-inherit opacity-60 hover:opacity-100"
            >
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )
          : <span className="w-3 shrink-0" />
        }

        <Link href={`/events/${event.id}`} className="flex items-center gap-2 flex-1 min-w-0">
          <Calendar className="w-3 h-3 shrink-0 opacity-70" />
          <span className="truncate flex-1">{event.name}</span>
          <span className="text-[10px] text-slate-500 shrink-0">{dateStr}</span>
          {!activeSubfolderId && badge(event._count?.mediaFiles ?? 0)}
        </Link>
      </div>

      {open && hasSubs && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {event.subfolders.map(sf => (
            <SubfolderRow
              key={sf.id}
              sf={sf}
              eventId={event.id}
              activeSubfolderId={activeSubfolderId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategorySection({
  cat, activeEventId, activeSubfolderId,
}: {
  cat: HierarchyCategory
  activeEventId?: string
  activeSubfolderId?: string
}) {
  const hasActive = cat.events.some(e => e.id === activeEventId)
  const [open, setOpen] = useState(hasActive || cat.events.length <= 5)
  const totalMedia = cat.events.reduce((s, e) => s + (e._count?.mediaFiles ?? 0), 0)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                   text-slate-300 hover:bg-slate-800/50 transition-all"
      >
        {open ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
        <span className="text-left flex-1 uppercase tracking-wider text-[10px] text-slate-500">
          {cat.name}
        </span>
        {badge(totalMedia)}
      </button>

      {open && cat.events.length > 0 && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {cat.events.map(event => (
            <EventRow
              key={event.id}
              event={event}
              activeEventId={activeEventId}
              activeSubfolderId={activeSubfolderId}
              defaultOpen={event.id === activeEventId}
            />
          ))}
        </div>
      )}

      {open && cat.events.length === 0 && (
        <p className="pl-8 text-[10px] text-slate-600 py-1">No events yet</p>
      )}
    </div>
  )
}

function YearSection({
  yearData, activeEventId, activeSubfolderId,
}: {
  yearData: HierarchyYear
  activeEventId?: string
  activeSubfolderId?: string
}) {
  const hasActive = yearData.categories.some(c => c.events.some(e => e.id === activeEventId))
  const [open, setOpen] = useState(hasActive || yearData.year === new Date().getFullYear())
  const eventCount = countEvents(yearData)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold
                   text-white hover:bg-slate-800/60 transition-all"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-slate-400" />
          : <ChevronRight className="w-4 h-4 text-slate-400" />
        }
        <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="flex-1 text-left">{yearData.year}</span>
        {badge(eventCount)}
      </button>

      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5">
          {yearData.categories.map(cat => (
            <CategorySection
              key={cat.id}
              cat={cat}
              activeEventId={activeEventId}
              activeSubfolderId={activeSubfolderId}
            />
          ))}
          {yearData.categories.length === 0 && (
            <p className="pl-4 text-[10px] text-slate-600 py-1">No categories yet</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────

export function FolderTree() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const activeEventId     = params?.eventId as string | undefined
  const activeSubfolderId = searchParams?.get('subfolder') ?? undefined

  const {
    data,
    error: swrError,
    isLoading,
    mutate: refreshTree,
  } = useSWR<{ years: HierarchyYear[] }>(
    '/api/hierarchy',
    fetcher,
    { ...SWR_CONFIG, refreshInterval: 30_000 },  // hierarchy poll can be slower than dashboard
  )

  const years   = data?.years ?? []
  const loading = isLoading
  const error   = swrError ? 'Failed to load' : ''

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/70 shrink-0">
        <div className="flex items-center gap-2">
          <FolderClosed className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Event Library</span>
        </div>
        <button
          onClick={() => refreshTree()}
          className="text-slate-500 hover:text-slate-300 transition"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tree body */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 text-center py-4">{error}</p>
        )}

        {!loading && !error && years.length === 0 && (
          <div className="text-center py-8 px-4">
            <Image className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No events yet.</p>
            <p className="text-xs text-slate-700 mt-0.5">
              Ask an admin to create one.
            </p>
          </div>
        )}

        {!loading && years.map(y => (
          <YearSection
            key={y.id}
            yearData={y}
            activeEventId={activeEventId}
            activeSubfolderId={activeSubfolderId}
          />
        ))}
      </div>
    </div>
  )
}
