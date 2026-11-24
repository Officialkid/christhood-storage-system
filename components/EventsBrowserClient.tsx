'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, FolderOpen, Plus, Upload, ArrowRight, Layers, Search,
} from 'lucide-react'
import { CreateEventModal } from '@/components/CreateEventModal'
import { OFFICIAL_CATEGORY_NAMES } from '@/lib/hierarchyConstants'
import type { HierarchyYear, HierarchyEvent } from '@/types'

interface Props {
  years:            HierarchyYear[]
  isAdmin:          boolean
  initialCategory?: string
}

interface FlatCategory {
  name:        string
  isDefault:   boolean
  eventCount:  number
  fileCount:   number
  latestYear:  number
}

interface EventWithContext extends HierarchyEvent {
  categoryName: string
  yearNumber:   number
}

export function EventsBrowserClient({ years, isAdmin, initialCategory }: Props) {
  const router = useRouter()
  const [selectedYear, setSelectedYear]         = useState<string>('ALL')
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory ?? 'ALL')
  const [searchQuery, setSearchQuery]           = useState('')
  const [showCreateModal, setShowCreateModal]   = useState(false)
  const [createPresetCat, setCreatePresetCat]   = useState<string | undefined>(undefined)

  const filteredYears = useMemo(() => {
    if (selectedYear === 'ALL') return years
    const yr = Number(selectedYear)
    return years.filter(y => y.year === yr)
  }, [years, selectedYear])

  // Aggregate categories across filtered years
  const categories = useMemo<FlatCategory[]>(() => {
    const map = new Map<string, FlatCategory>()
    for (const yr of filteredYears) {
      for (const cat of yr.categories) {
        if (cat.isArchived) continue
        const files = cat.events.reduce((s, e) => s + (e._count?.mediaFiles ?? 0), 0)
        const existing = map.get(cat.name)
        if (existing) {
          existing.eventCount += cat.events.length
          existing.fileCount  += files
          existing.latestYear  = Math.max(existing.latestYear, yr.year)
        } else {
          map.set(cat.name, {
            name:       cat.name,
            isDefault:  cat.isDefault,
            eventCount: cat.events.length,
            fileCount:  files,
            latestYear: yr.year,
          })
        }
      }
    }

    // Sort official categories first in canonical order, then custom categories alphabetically
    const officialOrder = new Map<string, number>(
      OFFICIAL_CATEGORY_NAMES.map((n, i) => [n, i])
    )
    return Array.from(map.values()).sort((a, b) => {
      const ai = officialOrder.has(a.name) ? officialOrder.get(a.name)! : 999
      const bi = officialOrder.has(b.name) ? officialOrder.get(b.name)! : 999
      if (ai !== bi) return ai - bi
      return a.name.localeCompare(b.name)
    })
  }, [filteredYears])

  // Flatten events matching selected category + search query
  const visibleEvents = useMemo<EventWithContext[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    const list: EventWithContext[] = []
    for (const yr of filteredYears) {
      for (const cat of yr.categories) {
        if (cat.isArchived) continue
        if (selectedCategory !== 'ALL' && cat.name !== selectedCategory) continue
        for (const ev of cat.events) {
          if (q) {
            const matchName = ev.name.toLowerCase().includes(q)
            const matchCat  = cat.name.toLowerCase().includes(q)
            const matchSub  = ev.subfolders.some(s => s.label.toLowerCase().includes(q))
            if (!matchName && !matchCat && !matchSub) continue
          }
          list.push({
            ...ev,
            categoryName: cat.name,
            yearNumber:   yr.year,
          })
        }
      }
    }
    return list.sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : new Date(a.createdAt).getTime()
      const bTime = b.date ? new Date(b.date).getTime() : new Date(b.createdAt).getTime()
      return bTime - aTime
    })
  }, [filteredYears, selectedCategory, searchQuery])

  function openCreateModal(categoryName?: string) {
    setCreatePresetCat(categoryName)
    setShowCreateModal(true)
  }

  return (
    <div className="space-y-8">
      {/* Header + Create New Event CTA */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Event Library</h1>
          <p className="mt-1 text-slate-400 text-sm">
            Pick a category below to jump straight into its events and Day folders, or create a new event.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {years.length > 1 && (
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Years</option>
              {years.map(y => (
                <option key={y.id} value={String(y.year)}>{y.year}</option>
              ))}
            </select>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => openCreateModal(selectedCategory !== 'ALL' ? selectedCategory : undefined)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                         bg-gradient-to-r from-indigo-600 to-violet-600
                         hover:from-indigo-500 hover:to-violet-500 transition shadow-lg shadow-indigo-500/20"
            >
              <Plus className="w-4 h-4" />
              Create New Event
            </button>
          )}
        </div>
      </div>

      {/* Category Quick-Access Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Browse by Category
          </h2>
          {selectedCategory !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              Show all categories
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`text-left p-4 rounded-2xl border transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-indigo-600/20 border-indigo-500/60 shadow-sm shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800/70 hover:border-slate-700 hover:bg-slate-900'
            }`}
          >
            <p className="text-sm font-semibold text-white truncate">All Categories</p>
            <p className="text-xs text-slate-400 mt-1">
              {categories.reduce((s, c) => s + c.eventCount, 0)} events ·{' '}
              {categories.reduce((s, c) => s + c.fileCount, 0)} files
            </p>
          </button>

          {categories.map(cat => {
            const active = selectedCategory === cat.name
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(active ? 'ALL' : cat.name)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  active
                    ? 'bg-indigo-600/20 border-indigo-500/60 shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-900/60 border-slate-800/70 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">{cat.name}</p>
                  {!cat.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 shrink-0">
                      Custom
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {cat.eventCount} event{cat.eventCount !== 1 ? 's' : ''} · {cat.fileCount} file{cat.fileCount !== 1 ? 's' : ''}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Events List for Selected Category */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-white">
            {selectedCategory === 'ALL' ? 'All Events' : selectedCategory}
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({visibleEvents.length})
            </span>
          </h2>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter events or days…"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5
                         text-xs text-white placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {visibleEvents.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 py-14 px-6 text-center">
            <CalendarDays className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {searchQuery
                ? `No events matching "${searchQuery}".`
                : selectedCategory === 'ALL'
                  ? 'No events created yet.'
                  : `No events in "${selectedCategory}" yet.`}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openCreateModal(selectedCategory !== 'ALL' ? selectedCategory : undefined)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                           text-white bg-indigo-600 hover:bg-indigo-500 transition"
              >
                <Plus className="w-4 h-4" />
                {selectedCategory === 'ALL' ? 'Create Your First Event' : `New Event in ${selectedCategory}`}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleEvents.map(ev => {
              const dateStr = ev.date
                ? new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : null
              const fileCount = ev._count?.mediaFiles ?? 0

              return (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4
                             hover:border-slate-700 transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/events/${ev.id}`} className="min-w-0 flex-1 group">
                      <p className="text-base font-semibold text-white group-hover:text-indigo-300 transition truncate">
                        {ev.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ev.categoryName} · {ev.yearNumber}
                        {dateStr ? ` · ${dateStr}` : ''}
                      </p>
                    </Link>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/upload?eventId=${ev.id}`}
                        title="Upload media to this event"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                   bg-indigo-600/20 text-indigo-300 border border-indigo-500/30
                                   hover:bg-indigo-600/30 transition"
                      >
                        <Upload className="w-3 h-3" />
                        Upload
                      </Link>
                      <Link
                        href={`/events/${ev.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        title="Open event"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Direct Day / Folder chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
                    {ev.subfolders.length > 0 ? (
                      ev.subfolders.map(sf => (
                        <Link
                          key={sf.id}
                          href={`/events/${ev.id}?subfolder=${sf.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
                                     bg-slate-800/80 text-slate-300 hover:bg-indigo-600 hover:text-white transition"
                        >
                          <FolderOpen className="w-3 h-3" />
                          {sf.label}
                          {(sf._count?.mediaFiles ?? 0) > 0 && (
                            <span className="text-[10px] opacity-75">({sf._count?.mediaFiles})</span>
                          )}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        {fileCount} file{fileCount !== 1 ? 's' : ''} · No day folders yet
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {showCreateModal && (
        <CreateEventModal
          years={years}
          initialCategoryName={createPresetCat}
          onClose={() => setShowCreateModal(false)}
          onCreated={created => {
            setShowCreateModal(false)
            router.push(`/events/${created.id}`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
