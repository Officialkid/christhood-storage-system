'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FolderTree, Plus, Pencil, Trash2, FolderPlus,
  ChevronRight, ChevronDown, Calendar, Loader2,
  X, Check, AlertTriangle,
} from 'lucide-react'
import { OFFICIAL_CATEGORY_NAMES, OTHER_CATEGORY_SENTINEL } from '@/lib/hierarchyConstants'
import type { HierarchyYear, HierarchyEvent, HierarchySubfolder } from '@/types'

// ─────────────────────────── Types ────────────────────────────
interface Creating {
  type: 'event' | 'subfolder'
  eventId?: string        // for subfolder
}
interface Editing {
  type: 'event' | 'subfolder'
  id:   string
  currentName: string
  currentDate?: string    // ISO date string for events
}

// ──────────────────────── Toast component ──────────────────────
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

// ──────────────────────── Create-event modal ──────────────────
function CreateEventModal({
  years,
  onClose,
  onCreated,
}: {
  years:     HierarchyYear[]
  onClose:   () => void
  onCreated: () => void
}) {
  const currentYear = new Date().getFullYear()
  const [name, setName]                     = useState('')
  const [date, setDate]                     = useState('')
  const [categoryValue, setCategoryValue]   = useState<string>(OFFICIAL_CATEGORY_NAMES[0])
  const [customCategoryName, setCustomCat]  = useState('')
  const [year, setYear]                     = useState(String(currentYear))
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  const isOther      = categoryValue === OTHER_CATEGORY_SENTINEL
  const yearNum      = Number(year)
  const yearData     = years.find(y => y.year === yearNum)
  const customCats   = yearData?.categories
    .filter(c => !c.isDefault && !c.isArchived)
    .map(c => c.name) ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !date || !year) return
    if (isOther && !customCategoryName.trim()) return
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name:         name.trim(),
        date,
        categoryName: categoryValue,
        yearNumber:   yearNum,
      }
      if (isOther) body.customCategoryName = customCategoryName.trim()
      const res = await fetch('/api/hierarchy/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to create event')
      }
      onCreated()
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl
                      shadow-2xl shadow-black/60 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Create Event</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Event Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Easter Convention 2025"
              className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                         px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Event Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-xl
                         px-3.5 py-2.5 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Category
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
              <option value={OTHER_CATEGORY_SENTINEL}>Other / Create new type…</option>
            </select>
          </div>

          {/* Custom category name (shown when Other selected) */}
          {isOther && (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                New Category Name
              </label>
              <input
                autoFocus
                value={customCategoryName}
                onChange={e => setCustomCat(e.target.value)}
                maxLength={80}
                placeholder="e.g. Leadership Retreat"
                className="mt-1.5 w-full bg-slate-800 border border-indigo-600/60 rounded-xl
                           px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-500">This will become a new category for future events.</p>
            </div>
          )}

          {/* Year */}
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

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />{error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400
                         border border-slate-700 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !date || (isOther && !customCategoryName.trim())}
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

// ────────────────────── Create-subfolder modal ─────────────────
function CreateSubfolderModal({
  eventId, eventName, onClose, onCreated,
}: {
  eventId:   string
  eventName: string
  onClose:   () => void
  onCreated: () => void
}) {
  const [label, setLabel]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/hierarchy/subfolders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), eventId }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to create subfolder')
      }
      onCreated()
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl
                      shadow-2xl shadow-black/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Add Subfolder</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">For event: <span className="text-slate-300">{eventName}</span></p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Day 1, Sunday Service..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl
                       px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400
                         border border-slate-700 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving || !label.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                         bg-gradient-to-r from-indigo-600 to-violet-600
                         hover:from-indigo-500 hover:to-violet-500
                         disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ──────────────────────── Inline rename input ─────────────────
function InlineRename({
  initialValue,
  initialDate,
  isEvent,
  onSave,
  onCancel,
}: {
  initialValue: string
  initialDate?: string
  isEvent:      boolean
  onSave:       (name: string, date?: string) => void
  onCancel:     () => void
}) {
  const [name, setName] = useState(initialValue)
  const [date, setDate] = useState(initialDate ?? '')

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  onSave(name, isEvent ? date : undefined)
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white
                   focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-0 flex-1"
      />
      {isEvent && (
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          onKeyDown={handleKey}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white
                     focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36 shrink-0"
        />
      )}
      <button onClick={() => onSave(name, isEvent ? date : undefined)}
        className="p-1 rounded text-emerald-400 hover:bg-emerald-900/40">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel}
        className="p-1 rounded text-slate-500 hover:bg-slate-700/60">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ──────────────────────── Main Component ──────────────────────
export default function AdminHierarchyPage() {
  const [years, setYears]             = useState<HierarchyYear[]>([])
  const [loading, setLoading]         = useState(true)
  const [creating, setCreating]       = useState<Creating | null>(null)
  const [editing, setEditing]         = useState<Editing | null>(null)
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null)
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = useState<string | null>(null)

  // ── Fetch tree ──
  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/hierarchy')
      if (!res.ok) throw new Error('Failed to load hierarchy')
      const data = await res.json()
      setYears(data.years ?? [])
    } catch {
      setYears([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  // ── Toast helper ──
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Toggle collapse ──
  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Rename event ──
  async function renameEvent(id: string, name: string, date: string) {
    const res = await fetch(`/api/hierarchy/events/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date }),
    })
    setEditing(null)
    if (res.ok) { showToast('Event updated'); await loadTree() }
    else        { showToast('Failed to update event', false) }
  }

  // ── Rename subfolder ──
  async function renameSubfolder(id: string, label: string) {
    const res = await fetch(`/api/hierarchy/subfolders/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    setEditing(null)
    if (res.ok) { showToast('Subfolder renamed'); await loadTree() }
    else        { showToast('Failed to rename', false) }
  }

  // ── Delete event ──
  async function deleteEvent(id: string) {
    if (!confirm('Delete this event? This cannot be undone.')) return
    setDeleting(id)
    const res = await fetch(`/api/hierarchy/events/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) { showToast('Event deleted'); await loadTree() }
    else {
      const j = await res.json()
      showToast(j.error ?? 'Failed to delete event', false)
    }
  }

  // ── Delete subfolder ──
  async function deleteSubfolder(id: string) {
    if (!confirm('Delete this subfolder? Media inside will become unorganised.')) return
    setDeleting(id)
    const res = await fetch(`/api/hierarchy/subfolders/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) { showToast('Subfolder deleted'); await loadTree() }
    else        { showToast('Failed to delete subfolder', false) }
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-violet-600/20 border border-violet-600/30 rounded-xl">
            <FolderTree className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Hierarchy Manager</h1>
            <p className="text-xs text-slate-500 mt-0.5">Create and manage years, events, and subfolders</p>
          </div>
        </div>

        <button
          onClick={() => setCreating({ type: 'event' })}
          className="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2.5 rounded-xl
                     bg-gradient-to-r from-indigo-600 to-violet-600
                     hover:from-indigo-500 hover:to-violet-500 transition shadow shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          New Event
        </button>
      </div>

      {/* Tree */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : years.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <FolderTree className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No events yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {years.map(yr => (
              <YearNode
                key={yr.id}
                year={yr}
                editing={editing}
                deleting={deleting}
                collapsed={collapsed}
                onToggle={toggle}
                onSetEditing={setEditing}
                onRenameEvent={renameEvent}
                onRenameSubfolder={renameSubfolder}
                onDeleteEvent={deleteEvent}
                onDeleteSubfolder={deleteSubfolder}
                onAddSubfolder={(evtId: string) =>
                  setCreating({ type: 'subfolder', eventId: evtId })
                }
                addSubfolderTarget={
                  creating?.type === 'subfolder' ? creating.eventId : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {creating?.type === 'event' && (
        <CreateEventModal
          years={years}
          onClose={() => setCreating(null)}
          onCreated={async () => {
            setCreating(null)
            showToast('Event created!')
            await loadTree()
          }}
        />
      )}
      {creating?.type === 'subfolder' && creating.eventId && (() => {
        // find event name from tree
        let evtName = 'Unknown event'
        for (const yr of years)
          for (const cat of yr.categories)
            for (const ev of cat.events)
              if (ev.id === creating.eventId) evtName = ev.name
        return (
          <CreateSubfolderModal
            eventId={creating.eventId}
            eventName={evtName}
            onClose={() => setCreating(null)}
            onCreated={async () => {
              setCreating(null)
              showToast('Subfolder added!')
              await loadTree()
            }}
          />
        )
      })()}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}

// ───────────────────── Tree sub-components ────────────────────
function YearNode({
  year, editing, deleting, collapsed, onToggle,
  onSetEditing, onRenameEvent, onRenameSubfolder,
  onDeleteEvent, onDeleteSubfolder, onAddSubfolder,
  addSubfolderTarget,
}: any) {
  const open = !collapsed.has(year.id)
  return (
    <div>
      <button
        onClick={() => onToggle(year.id)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
                   text-slate-300 hover:bg-slate-800/60 transition"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        }
        <span className="text-sm font-bold text-white">{year.year}</span>
        <span className="ml-auto text-xs text-slate-600">{year.categories.length} categories</span>
      </button>

      {open && (
        <div className="ml-4 border-l border-slate-800/60 pl-3 space-y-0.5 mt-0.5">
          {year.categories.map((cat: any) => (
            <CategoryNode
              key={cat.id}
              category={cat}
              editing={editing}
              deleting={deleting}
              collapsed={collapsed}
              onToggle={onToggle}
              onSetEditing={onSetEditing}
              onRenameEvent={onRenameEvent}
              onRenameSubfolder={onRenameSubfolder}
              onDeleteEvent={onDeleteEvent}
              onDeleteSubfolder={onDeleteSubfolder}
              onAddSubfolder={onAddSubfolder}
              addSubfolderTarget={addSubfolderTarget}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryNode({
  category, editing, deleting, collapsed, onToggle,
  onSetEditing, onRenameEvent, onRenameSubfolder,
  onDeleteEvent, onDeleteSubfolder, onAddSubfolder,
  addSubfolderTarget,
}: any) {
  const open = !collapsed.has(category.id)
  return (
    <div>
      <button
        onClick={() => onToggle(category.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left
                   hover:bg-slate-800/50 transition"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
        }
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          {category.name}
        </span>
        <span className="ml-auto text-xs text-slate-700">{category.events.length}</span>
      </button>

      {open && (
        <div className="ml-4 border-l border-slate-800/50 pl-3 space-y-0.5 mt-0.5">
          {category.events.map((evt: HierarchyEvent) => (
            <EventNode
              key={evt.id}
              event={evt}
              editing={editing}
              deleting={deleting}
              collapsed={collapsed}
              onToggle={onToggle}
              onSetEditing={onSetEditing}
              onRenameEvent={onRenameEvent}
              onRenameSubfolder={onRenameSubfolder}
              onDeleteEvent={onDeleteEvent}
              onDeleteSubfolder={onDeleteSubfolder}
              onAddSubfolder={onAddSubfolder}
              addSubfolderTarget={addSubfolderTarget}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EventNode({
  event, editing, deleting, collapsed, onToggle,
  onSetEditing, onRenameEvent, onRenameSubfolder,
  onDeleteEvent, onDeleteSubfolder, onAddSubfolder,
}: any) {
  const open           = !collapsed.has(event.id)
  const isEditing      = editing?.type === 'event' && editing.id === event.id
  const isDeleting     = deleting === event.id
  const hasSubfolders  = event.subfolders?.length > 0
  const mediaCount     = event._count?.mediaFiles ?? 0
  const dateStr        = new Date(event.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const isoDate = event.date?.slice(0, 10) ?? ''

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg group hover:bg-slate-800/40">
        {/* Expand toggle */}
        {hasSubfolders
          ? (
            <button onClick={() => onToggle(event.id)} className="text-slate-600 hover:text-slate-400">
              {open
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </button>
          ) : <span className="w-3" />
        }

        {/* Name / inline-edit */}
        {isEditing ? (
          <InlineRename
            initialValue={event.name}
            initialDate={isoDate}
            isEvent
            onSave={(name, date) => onRenameEvent(event.id, name, date ?? isoDate)}
            onCancel={() => onSetEditing(null)}
          />
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm text-slate-300 truncate">{event.name}</span>
            <span className="text-xs text-slate-600 flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3" />{dateStr}
            </span>
            {mediaCount > 0 && (
              <span className="ml-auto text-xs bg-slate-700/80 text-slate-400
                               px-1.5 py-0.5 rounded-full shrink-0">
                {mediaCount}
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shrink-0 ml-1">
            <button
              title="Add subfolder"
              onClick={() => onAddSubfolder(event.id, event.name)}
              className="p-1 rounded text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/30"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              title="Rename / redate"
              onClick={() => onSetEditing({ type: 'event', id: event.id, currentName: event.name, currentDate: isoDate })}
              className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-sky-900/30"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              title="Delete event"
              onClick={() => onDeleteEvent(event.id)}
              disabled={isDeleting}
              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/30
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDeleting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        )}
      </div>

      {/* Subfolders */}
      {open && hasSubfolders && (
        <div className="ml-6 border-l border-slate-800/40 pl-3 space-y-0.5">
          {event.subfolders.map((sf: HierarchySubfolder) => (
            <SubfolderNode
              key={sf.id}
              subfolder={sf}
              editing={editing}
              deleting={deleting}
              onSetEditing={onSetEditing}
              onRename={onRenameSubfolder}
              onDelete={onDeleteSubfolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubfolderNode({
  subfolder, editing, deleting, onSetEditing, onRename, onDelete,
}: any) {
  const isEditing  = editing?.type === 'subfolder' && editing.id === subfolder.id
  const isDeleting = deleting === subfolder.id
  const mediaCount = subfolder._count?.mediaFiles ?? 0

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg group hover:bg-slate-800/40">
      <span className="w-3" />

      {isEditing ? (
        <InlineRename
          initialValue={subfolder.label}
          isEvent={false}
          onSave={label => onRename(subfolder.id, label)}
          onCancel={() => onSetEditing(null)}
        />
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs text-slate-400 truncate">{subfolder.label}</span>
          {mediaCount > 0 && (
            <span className="ml-auto text-xs bg-slate-700/70 text-slate-500
                             px-1.5 py-0.5 rounded-full shrink-0">
              {mediaCount}
            </span>
          )}
        </div>
      )}

      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shrink-0 ml-1">
          <button
            title="Rename"
            onClick={() => onSetEditing({ type: 'subfolder', id: subfolder.id, currentName: subfolder.label })}
            className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-sky-900/30"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            title="Delete"
            onClick={() => onDelete(subfolder.id)}
            disabled={isDeleting}
            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/30
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      )}
    </div>
  )
}
