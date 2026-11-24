'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle, FolderPlus, CalendarDays, Plus } from 'lucide-react'
import { OFFICIAL_CATEGORY_NAMES, OTHER_CATEGORY_SENTINEL } from '@/lib/hierarchyConstants'
import type { HierarchyYear } from '@/types'

export interface CreatedEventSummary {
  id: string
  name: string
  date: string | null
  category: { id: string; name: string; year: { year: number } }
  subfolders: { id: string; label: string }[]
}

interface CreateEventModalProps {
  /** Optional preloaded hierarchy years (if omitted, modal fetches custom categories automatically). */
  years?:               HierarchyYear[]
  initialCategoryName?: string
  initialYear?:         number
  onClose:              () => void
  onCreated:            (event: CreatedEventSummary) => void
}

export function CreateEventModal({
  years: providedYears,
  initialCategoryName,
  initialYear,
  onClose,
  onCreated,
}: CreateEventModalProps) {
  const currentYear = new Date().getFullYear()
  const [fetchedYears, setFetchedYears]     = useState<HierarchyYear[]>(providedYears ?? [])
  const [name, setName]                     = useState('')
  const [date, setDate]                     = useState('')
  const [categoryValue, setCategoryValue]   = useState<string>(initialCategoryName ?? OFFICIAL_CATEGORY_NAMES[0])
  const [customCategoryName, setCustomCat]  = useState('')
  const [year, setYear]                     = useState(String(initialYear ?? currentYear))
  const [folders, setFolders]               = useState<string[]>([])
  const [folderDraft, setFolderDraft]       = useState('')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => {
    if (providedYears) {
      setFetchedYears(providedYears)
      return
    }
    let active = true
    fetch('/api/hierarchy')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data?.years) setFetchedYears(data.years)
      })
      .catch(() => {})
    return () => { active = false }
  }, [providedYears])

  const isOther  = categoryValue === OTHER_CATEGORY_SENTINEL
  const yearNum  = Number(year) || currentYear
  const yearData = fetchedYears.find(y => y.year === yearNum)

  // Collect custom categories across the selected year (and any other years so users can reuse them easily)
  const customCatSet = new Set<string>()
  const officialSet  = new Set<string>(OFFICIAL_CATEGORY_NAMES)
  for (const yr of yearData ? [yearData, ...fetchedYears] : fetchedYears) {
    for (const c of yr.categories) {
      if (!c.isDefault && !c.isArchived && !officialSet.has(c.name)) {
        customCatSet.add(c.name)
      }
    }
  }
  const customCats = Array.from(customCatSet).sort((a, b) => a.localeCompare(b))

  function handleDateChange(val: string) {
    setDate(val)
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parsedYear = Number(val.slice(0, 4))
      if (parsedYear >= 2000 && parsedYear <= 2100) {
        setYear(String(parsedYear))
      }
    }
  }

  function addFolders(newItems: string[]) {
    setFolders(prev => {
      const existing = new Set(prev.map(f => f.toLowerCase()))
      const next = [...prev]
      for (const raw of newItems) {
        const cleaned = raw.trim()
        if (!cleaned) continue
        const key = cleaned.toLowerCase()
        if (!existing.has(key)) {
          existing.add(key)
          next.push(cleaned)
        }
      }
      return next
    })
  }

  function addDraftFolder() {
    if (!folderDraft.trim()) return
    // Support comma-separated quick entry like "Day 1, Day 2, Day 3"
    const parts = folderDraft.split(',').map(p => p.trim()).filter(Boolean)
    addFolders(parts)
    setFolderDraft('')
  }

  function removeFolder(label: string) {
    setFolders(prev => prev.filter(f => f !== label))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !year) return
    if (isOther && !customCategoryName.trim()) return

    // Include any un-added text in folderDraft so the user never loses what they typed
    const finalFolders = [...folders]
    if (folderDraft.trim()) {
      const existing = new Set(finalFolders.map(f => f.toLowerCase()))
      for (const part of folderDraft.split(',').map(p => p.trim()).filter(Boolean)) {
        if (!existing.has(part.toLowerCase())) {
          existing.add(part.toLowerCase())
          finalFolders.push(part)
        }
      }
    }

    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name:         name.trim(),
        date:         date.trim() || null,
        categoryName: categoryValue,
        yearNumber:   yearNum,
        subfolders:   finalFolders,
      }
      if (isOther) body.customCategoryName = customCategoryName.trim()

      const res = await fetch('/api/hierarchy/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create event')
      }
      onCreated(json.event)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create event')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700/60
                   rounded-2xl shadow-2xl shadow-black/60 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Create a New Event</h2>
              <p className="text-xs text-slate-400">Set up an event and optional Day folders in one step</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event Title */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Event Title <span className="text-rose-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jewels Kids Camp 2026"
              className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                         px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Category <span className="text-rose-400">*</span>
            </label>
            <select
              value={categoryValue}
              onChange={e => { setCategoryValue(e.target.value); setCustomCat('') }}
              className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                         px-3.5 py-2.5 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <optgroup label="Official Categories">
                {OFFICIAL_CATEGORY_NAMES.map(cn => (
                  <option key={cn} value={cn}>{cn}</option>
                ))}
              </optgroup>
              {customCats.length > 0 && (
                <optgroup label="Custom Categories">
                  {customCats.map(cn => (
                    <option key={cn} value={cn}>{cn}</option>
                  ))}
                </optgroup>
              )}
              <option value={OTHER_CATEGORY_SENTINEL}>+ Other (Create new category…)</option>
            </select>
          </div>

          {/* Custom category name (shown when Other selected) */}
          {isOther && (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                New Category Name <span className="text-rose-400">*</span>
              </label>
              <input
                autoFocus
                value={customCategoryName}
                onChange={e => setCustomCat(e.target.value)}
                maxLength={80}
                placeholder="e.g. Youth Retreat, Outreach, Media Training"
                className="mt-1.5 w-full bg-slate-800 border border-indigo-500/60 rounded-xl
                           px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                This will be saved as a reusable category for future events.
              </p>
            </div>
          )}

          {/* Optional Date + Year */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Date <span className="text-slate-500 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => handleDateChange(e.target.value)}
                className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                           px-3.5 py-2.5 text-sm text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Year
              </label>
              <input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={e => setYear(e.target.value)}
                className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                           px-3.5 py-2.5 text-sm text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Optional Folders / Days */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
                Folders / Days <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addFolders(['Day 1', 'Day 2', 'Day 3'])}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-600/20
                             text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition"
                >
                  + Day 1–3
                </button>
                <button
                  type="button"
                  onClick={() => addFolders(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'])}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800
                             text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
                >
                  + Day 1–5
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={folderDraft}
                onChange={e => setFolderDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDraftFolder()
                  }
                }}
                placeholder="Type folder name (e.g. Day 1) and press Enter"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl
                           px-3 py-2 text-xs text-white placeholder:text-slate-500
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={addDraftFolder}
                disabled={!folderDraft.trim()}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 text-slate-200
                           border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {folders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {folders.map(label => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                               bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-200"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeFolder(label)}
                      className="text-indigo-300/70 hover:text-white transition"
                      aria-label={`Remove ${label}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400
                         border border-slate-700 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || (isOther && !customCategoryName.trim())}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                         bg-gradient-to-r from-indigo-600 to-violet-600
                         hover:from-indigo-500 hover:to-violet-500
                         disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
