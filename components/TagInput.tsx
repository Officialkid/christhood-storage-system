'use client'

/**
 * TagInput
 * Full tag-editing widget: shows applied tags as removable pills,
 * plus an autocomplete input to add more from the global tag list.
 *
 * Calls PUT /api/media/[fileId]/tags or PUT /api/events/[eventId]/tags
 * with the complete new set of tagIds on every change.
 *
 * Props:
 *  - targetType: 'file' | 'event'
 *  - targetId:   fileId or eventId
 *  - initialTags: tags already applied (from SSR)
 *  - allTags:     full tag catalogue (from SSR)
 *  - canEdit:     false → read-only display only
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { TagPill } from '@/components/TagPill'

export interface TagOption {
  id:   string
  name: string
}

interface Props {
  targetType:   'file' | 'event'
  targetId:     string
  initialTags:  TagOption[]
  allTags:      TagOption[]
  canEdit:      boolean
  onChanged?:   (tags: TagOption[]) => void
}

export function TagInput({
  targetType,
  targetId,
  initialTags,
  allTags,
  canEdit,
  onChanged,
}: Props) {
  const [applied,   setApplied]   = useState<TagOption[]>(initialTags)
  const [query,     setQuery]     = useState('')
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)
  const wrapperRef                = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const endpoint =
    targetType === 'file'
      ? `/api/media/${targetId}/tags`
      : `/api/events/${targetId}/tags`

  const save = useCallback(async (newTags: TagOption[]) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tagIds: newTags.map((t) => t.id) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save tags')
      }
      const data = await res.json()
      const saved: TagOption[] = data.tags ?? newTags
      setApplied(saved)
      onChanged?.(saved)
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setSaving(false)
    }
  }, [endpoint, onChanged])

  // Tags available to add (not already applied, matching the search query)
  const appliedIds = new Set(applied.map((t) => t.id))
  const suggestions = allTags.filter(
    (t) =>
      !appliedIds.has(t.id) &&
      t.name.toLowerCase().includes(query.toLowerCase())
  )

  async function addTag(tag: TagOption) {
    const next = [...applied, tag]
    setApplied(next)      // optimistic
    setQuery('')
    setOpen(false)
    await save(next)
  }

  async function removeTag(id: string) {
    const next = applied.filter((t) => t.id !== id)
    setApplied(next)      // optimistic
    await save(next)
  }

  // ── Read-only view ──────────────────────────────────────────────────────────
  if (!canEdit) {
    if (applied.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5">
        {applied.map((t) => <TagPill key={t.id} name={t.name} />)}
      </div>
    )
  }

  // ── Edit view ───────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="space-y-2">
      {/* Applied tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {applied.length === 0 && (
          <span className="text-xs text-slate-600 italic">No tags yet</span>
        )}
        {applied.map((t) => (
          <TagPill
            key={t.id}
            name={t.name}
            onRemove={() => removeTag(t.id)}
          />
        ))}
        {saving && (
          <span className="text-xs text-slate-500 italic self-center">Saving…</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Autocomplete input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Add tag…"
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg bg-slate-800 border border-slate-700
                     px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600
                     focus:outline-none focus:border-indigo-500 transition-colors"
        />

        {open && (
          <div
            className="absolute top-full mt-1 left-0 right-0 z-30
                       rounded-lg border border-slate-700 bg-slate-900 shadow-2xl
                       max-h-48 overflow-y-auto"
          >
            {suggestions.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-slate-500 italic">
                {query.length > 0
                  ? `No matching tags (admin can create "${query}")`
                  : 'All tags already applied'}
              </p>
            ) : (
              suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // keep focus on input
                  onClick={() => addTag(t)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left
                             text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <span className="text-teal-400 text-xs">+</span>
                  {t.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
