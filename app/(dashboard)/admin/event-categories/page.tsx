'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Tags, Shield, User, Archive, ArchiveRestore, Pencil,
  Check, X, AlertTriangle, Loader2, ChevronDown, ChevronRight,
  GitMerge,
} from 'lucide-react'

// ─────────────────────── Types ────────────────────────────────
interface CategoryUser {
  id:       string
  username: string
  email:    string
}
interface CategoryYear {
  id:   string
  year: number
}
interface AdminCategory {
  id:              string
  name:            string
  yearId:          string
  isDefault:       boolean
  isArchived:      boolean
  createdByUserId: string | null
  year:            CategoryYear
  createdByUser:   CategoryUser | null
  _count:          { events: number }
}

// ─────────────────────── Toast ─────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl
                     shadow-xl border text-sm font-medium animate-in slide-in-from-bottom-4
                     ${ok
                       ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                       : 'bg-red-950 border-red-800 text-red-300'
                     }`}
    >
      {ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {msg}
    </div>
  )
}

// ─────────────────────── Category Row ─────────────────────────
function CategoryRow({
  cat,
  peersInYear,
  onRename,
  onToggleArchive,
  onMerge,
}: {
  cat:            AdminCategory
  peersInYear:    AdminCategory[]
  onRename:       (id: string, name: string) => Promise<void>
  onToggleArchive:(id: string, archive: boolean) => Promise<void>
  onMerge:        (sourceId: string, targetId: string) => Promise<void>
}) {
  const [editing,    setEditing]    = useState(false)
  const [renameVal,  setRenameVal]  = useState(cat.name)
  const [merging,    setMerging]    = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [saving,     setSaving]     = useState(false)

  const mergeTargets = peersInYear.filter(p => p.id !== cat.id && !p.isArchived)

  async function submitRename() {
    if (!renameVal.trim() || renameVal.trim() === cat.name) { setEditing(false); return }
    setSaving(true)
    await onRename(cat.id, renameVal.trim())
    setSaving(false)
    setEditing(false)
  }

  async function submitMerge() {
    if (!mergeTarget) return
    setSaving(true)
    await onMerge(cat.id, mergeTarget)
    setSaving(false)
    setMerging(false)
    setMergeTarget('')
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition
                     ${cat.isArchived
                       ? 'bg-slate-900/30 border-slate-800/40 opacity-60'
                       : 'bg-slate-900/60 border-slate-800/60'
                     }`}>
      {/* Type icon */}
      {cat.isDefault
        ? <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        : <User   className="w-3.5 h-3.5 text-amber-400 shrink-0"  />
      }

      {/* Name / inline editor */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditing(false) }}
              maxLength={80}
              className="bg-slate-800 border border-indigo-600/60 rounded-lg px-2.5 py-1 text-sm
                         text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
            />
            <button onClick={submitRename} disabled={saving}
              className="p-1 rounded text-emerald-400 hover:bg-emerald-900/40">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setEditing(false); setRenameVal(cat.name) }}
              className="p-1 rounded text-slate-500 hover:bg-slate-700/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-sm font-medium truncate ${cat.isArchived ? 'line-through text-slate-500' : 'text-white'}`}>
              {cat.name}
            </span>
            {cat.isArchived && (
              <span className="shrink-0 text-xs text-slate-600 italic">archived</span>
            )}
          </div>
        )}

        {/* Merge UI */}
        {merging && (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={mergeTarget}
              onChange={e => setMergeTarget(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5
                         text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— select merge target —</option>
              {mergeTargets.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t._count.events} events)</option>
              ))}
            </select>
            <button
              onClick={submitMerge}
              disabled={!mergeTarget || saving}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white
                         bg-amber-600 hover:bg-amber-500 disabled:opacity-40 transition"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Merge'}
            </button>
            <button onClick={() => { setMerging(false); setMergeTarget('') }}
              className="p-1 rounded text-slate-500 hover:bg-slate-700/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Event count pill */}
      <span className="shrink-0 text-xs text-slate-500 tabular-nums">
        {cat._count.events} event{cat._count.events !== 1 ? 's' : ''}
      </span>

      {/* Creator */}
      {cat.createdByUser && (
        <span className="shrink-0 hidden sm:inline text-xs text-slate-600 truncate max-w-[120px]">
          by {cat.createdByUser.username}
        </span>
      )}

      {/* Actions */}
      {!editing && !merging && (
        <div className="flex items-center gap-1 shrink-0">
          {/* Rename — custom cats only */}
          {!cat.isDefault && (
            <button
              onClick={() => { setEditing(true); setRenameVal(cat.name) }}
              title="Rename"
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700/60 transition"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Merge — any non-archived category */}
          {!cat.isArchived && mergeTargets.length > 0 && (
            <button
              onClick={() => setMerging(true)}
              title="Merge into another category"
              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/30 transition"
            >
              <GitMerge className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Archive / Unarchive — custom cats only */}
          {!cat.isDefault && (
            <button
              onClick={() => onToggleArchive(cat.id, !cat.isArchived)}
              title={cat.isArchived ? 'Unarchive' : 'Archive'}
              className={`p-1.5 rounded-lg transition ${
                cat.isArchived
                  ? 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/30'
                  : 'text-slate-500 hover:text-orange-400 hover:bg-orange-900/30'
              }`}
            >
              {cat.isArchived
                ? <ArchiveRestore className="w-3.5 h-3.5" />
                : <Archive        className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────── Main Page ────────────────────────────
export default function AdminEventCategoriesPage() {
  const [categories,      setCategories]      = useState<AdminCategory[]>([])
  const [loading,         setLoading]         = useState(true)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [filterYear,      setFilterYear]      = useState<number | 'all'>('all')
  const [collapsed,       setCollapsed]       = useState<Set<number>>(new Set())
  const [toast,           setToast]           = useState<{ msg: string; ok: boolean } | null>(null)

  // ── Fetch ──────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/admin/categories?includeArchived=${includeArchived}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load categories')
      const data = await res.json()
      setCategories(data.categories ?? [])
    } catch {
      setCategories([])
      showToast('Failed to load categories', false)
    } finally {
      setLoading(false)
    }
  }, [includeArchived])

  useEffect(() => { loadCategories() }, [loadCategories])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Actions ────────────────────────────────────────────────
  async function handleRename(id: string, name: string) {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    if (res.ok) { showToast('Category renamed'); await loadCategories() }
    else {
      const j = await res.json()
      showToast(j.error ?? 'Failed to rename', false)
    }
  }

  async function handleToggleArchive(id: string, archive: boolean) {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isArchived: archive }),
    })
    if (res.ok) {
      showToast(archive ? 'Category archived' : 'Category unarchived')
      await loadCategories()
    } else {
      const j = await res.json()
      showToast(j.error ?? 'Failed to update', false)
    }
  }

  async function handleMerge(sourceId: string, targetId: string) {
    const res = await fetch(`/api/admin/categories/${sourceId}/merge`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ targetCategoryId: targetId }),
    })
    if (res.ok) {
      const j = await res.json()
      showToast(j.message ?? 'Categories merged')
      await loadCategories()
    } else {
      const j = await res.json()
      showToast(j.error ?? 'Failed to merge', false)
    }
  }

  // ── Derive grouped / filtered data ────────────────────────
  const allYears = [...new Set(categories.map(c => c.year.year))].sort((a, b) => b - a)

  const visibleCategories = filterYear === 'all'
    ? categories
    : categories.filter(c => c.year.year === filterYear)

  const grouped = allYears
    .filter(y => filterYear === 'all' || y === filterYear)
    .map(y => ({
      year:       y,
      categories: visibleCategories.filter(c => c.year.year === y),
    }))
    .filter(g => g.categories.length > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 border border-indigo-600/30 rounded-xl">
            <Tags className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Event Categories</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage, rename, merge, or archive event categories
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year filter */}
          <select
            value={filterYear === 'all' ? 'all' : String(filterYear)}
            onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All years</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Show archived */}
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500
                         focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            Show archived
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-indigo-400" /> Official (protected)
        </span>
        <span className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-amber-400" /> Custom (renameable / archiveable)
        </span>
        <span className="flex items-center gap-1.5">
          <GitMerge className="w-3.5 h-3.5 text-slate-500" /> Merge events into another category
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <Tags className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No categories found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ year, categories: cats }) => {
            const isCollapsed = collapsed.has(year)
            return (
              <div key={year} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden">
                {/* Year header */}
                <button
                  onClick={() =>
                    setCollapsed(prev => {
                      const next = new Set(prev)
                      next.has(year) ? next.delete(year) : next.add(year)
                      return next
                    })
                  }
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left
                             hover:bg-slate-800/40 transition border-b border-slate-800/60"
                >
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-slate-500" />
                    : <ChevronDown  className="w-4 h-4 text-slate-500" />
                  }
                  <span className="text-sm font-bold text-white">{year}</span>
                  <span className="text-xs text-slate-500 ml-1">
                    {cats.length} categor{cats.length !== 1 ? 'ies' : 'y'}
                  </span>
                </button>

                {/* Category rows */}
                {!isCollapsed && (
                  <div className="p-3 space-y-2">
                    {cats.map(cat => (
                      <CategoryRow
                        key={cat.id}
                        cat={cat}
                        peersInYear={cats}
                        onRename={handleRename}
                        onToggleArchive={handleToggleArchive}
                        onMerge={handleMerge}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}
