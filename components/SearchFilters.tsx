'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams }       from 'next/navigation'
import { ChevronDown, ChevronUp, SlidersHorizontal, RotateCcw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface YearOption     { id: string; year: number }
interface CategoryOption { id: string; name: string; yearId: string; year: YearOption }
interface TagOption      { id: string; name: string }
interface UserOption     { id: string; username: string | null; email: string }

export interface FilterOptions {
  years:      YearOption[]
  categories: CategoryOption[]
  tags:       TagOption[]
  users:      UserOption[]
}

const ALL_STATUSES = [
  { value: 'RAW',                label: 'Raw'                },
  { value: 'EDITING_IN_PROGRESS', label: 'Editing in Progress' },
  { value: 'EDITED',             label: 'Edited'             },
  { value: 'PUBLISHED',          label: 'Published'          },
  { value: 'ARCHIVED',           label: 'Archived'           },
  { value: 'DELETED',            label: 'Deleted (Trash)'    },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first'  },
  { value: 'oldest', label: 'Oldest first'  },
  { value: 'name',   label: 'File name A–Z' },
  { value: 'size',   label: 'Largest first' },
]

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  options: FilterOptions
  isAdmin: boolean
}

export function SearchFilters({ options, isAdmin }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(true)

  // ── Local form state (initialised from URL) ───────────────────────────────
  const [year,       setYear      ] = useState(searchParams.get('year')       ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const [eventId,    setEventId   ] = useState(searchParams.get('eventId')    ?? '')
  const [fileType,   setFileType  ] = useState(searchParams.get('fileType')   ?? '')
  const [uploaderId, setUploaderId] = useState(searchParams.get('uploaderId') ?? '')
  const [statuses,   setStatuses  ] = useState<string[]>(
    searchParams.get('status')?.split(',').filter(Boolean) ?? []
  )
  const [selectedTags, setSelectedTags] = useState<string[]>(
    searchParams.get('tags')?.split(',').filter(Boolean) ?? []
  )
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '')
  const [dateTo,   setDateTo  ] = useState(searchParams.get('dateTo')   ?? '')
  const [sort,     setSort    ] = useState(searchParams.get('sort')     ?? 'newest')

  // Re-sync when URL changes (e.g. someone clicks a breadcrumb)
  useEffect(() => {
    setYear(searchParams.get('year') ?? '')
    setCategoryId(searchParams.get('categoryId') ?? '')
    setEventId(searchParams.get('eventId') ?? '')
    setFileType(searchParams.get('fileType') ?? '')
    setUploaderId(searchParams.get('uploaderId') ?? '')
    setStatuses(searchParams.get('status')?.split(',').filter(Boolean) ?? [])
    setSelectedTags(searchParams.get('tags')?.split(',').filter(Boolean) ?? [])
    setDateFrom(searchParams.get('dateFrom') ?? '')
    setDateTo(searchParams.get('dateTo') ?? '')
    setSort(searchParams.get('sort') ?? 'newest')
  }, [searchParams])

  // Categories filtered to selected year
  const visibleCategories = year
    ? options.categories.filter(c => c.year.year === parseInt(year, 10))
    : options.categories

  function toggleStatus(s: string) {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function toggleTag(name: string) {
    setSelectedTags(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
  }

  const countActive = useCallback(() => {
    return [year, categoryId, eventId, fileType, uploaderId, dateFrom, dateTo]
      .filter(Boolean).length
      + statuses.length + selectedTags.length
  }, [year, categoryId, eventId, fileType, uploaderId, dateFrom, dateTo, statuses, selectedTags])

  function buildParams(extra?: Record<string, string>) {
    const p = new URLSearchParams()
    const q = searchParams.get('q') ?? ''
    if (q)             p.set('q', q)
    if (year)          p.set('year', year)
    if (categoryId)    p.set('categoryId', categoryId)
    if (eventId)       p.set('eventId', eventId)
    if (fileType)      p.set('fileType', fileType)
    if (uploaderId)    p.set('uploaderId', uploaderId)
    if (statuses.length)      p.set('status', statuses.join(','))
    if (selectedTags.length)  p.set('tags',   selectedTags.join(','))
    if (dateFrom)      p.set('dateFrom', dateFrom)
    if (dateTo)        p.set('dateTo',   dateTo)
    p.set('sort', sort)
    p.set('page', '1')
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    return p.toString()
  }

  function handleApply(e?: React.FormEvent) {
    e?.preventDefault()
    router.push('/search?' + buildParams())
  }

  function handleReset() {
    setYear(''); setCategoryId(''); setEventId(''); setFileType('')
    setUploaderId(''); setStatuses([]); setSelectedTags([])
    setDateFrom(''); setDateTo(''); setSort('newest')
    const q = searchParams.get('q') ?? ''
    router.push('/search' + (q ? '?q=' + encodeURIComponent(q) + '&page=1' : '?page=1'))
  }

  // Auto-reset categoryId when year changes and category doesn't belong to that year
  useEffect(() => {
    if (year && categoryId) {
      const cat = options.categories.find(c => c.id === categoryId)
      if (cat && cat.year.year !== parseInt(year, 10)) setCategoryId('')
    }
  }, [year, categoryId, options.categories])

  const activeCount = countActive()

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-300
                   hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
          Advanced Filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full
                             bg-indigo-600 text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Filter body */}
      {open && (
        <form onSubmit={handleApply} className="border-t border-slate-800 px-5 py-4 space-y-5">

          {/* Row 1: Year + Category + Sort */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Year */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Year</label>
              <select
                value={year}
                onChange={e => { setYear(e.target.value); setCategoryId('') }}
                className={selectCls}
              >
                <option value="">All years</option>
                {options.years.map(y => (
                  <option key={y.id} value={String(y.year)}>{y.year}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
                <option value="">All categories</option>
                {visibleCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Sort by</label>
              <select value={sort} onChange={e => setSort(e.target.value)} className={selectCls}>
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: File type + Uploader */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* File type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">File type</label>
              <div className="flex gap-3 pt-1">
                {(['', 'PHOTO', 'VIDEO'] as const).map(ft => (
                  <label key={ft} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-300">
                    <input
                      type="radio"
                      name="fileType"
                      value={ft}
                      checked={fileType === ft}
                      onChange={() => setFileType(ft)}
                      className="accent-indigo-500"
                    />
                    {ft === '' ? 'All' : ft === 'PHOTO' ? 'Photos' : 'Videos'}
                  </label>
                ))}
              </div>
            </div>

            {/* Uploader (admin only) */}
            {isAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Uploader</label>
                <select value={uploaderId} onChange={e => setUploaderId(e.target.value)} className={selectCls}>
                  <option value="">Anyone</option>
                  {options.users.map(u => (
                    <option key={u.id} value={u.id}>{u.username ?? u.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Row 3: Status checkboxes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">File status</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {ALL_STATUSES
                .filter(s => isAdmin || s.value !== 'DELETED')
                .map(s => {
                  const active = statuses.includes(s.value)
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleStatus(s.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition
                        ${active
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                        }`}
                    >
                      {s.label}
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Row 4: Tags */}
          {options.tags.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tags</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {options.tags.map(t => {
                  const active = selectedTags.includes(t.name)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.name)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition
                        ${active
                          ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                        }`}
                    >
                      #{t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Row 5: Upload date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Upload date from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Upload date to</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset filters
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                         font-semibold transition shadow shadow-indigo-500/20"
            >
              Apply filters
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Shared Tailwind shorthand ─────────────────────────────────────────────────
const selectCls = `w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm
  text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition`

const inputCls = `w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm
  text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition
  [color-scheme:dark]`
