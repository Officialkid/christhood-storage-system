'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderOpen, FolderPlus, Plus, X, Loader2, Check, AlertTriangle } from 'lucide-react'

interface SubfolderItem {
  id: string
  label: string
  _count?: { mediaFiles: number }
}

interface EventFolderBarProps {
  eventId:           string
  subfolders:        SubfolderItem[]
  activeSubfolderId?: string
  totalFilesCount:   number
  isAdmin:           boolean
}

function getNextDaySuggestion(subfolders: SubfolderItem[]): string {
  let maxDay = 0
  for (const sf of subfolders) {
    const match = sf.label.trim().match(/^day\s*(\d+)$/i)
    if (match) {
      const n = Number(match[1])
      if (n > maxDay) maxDay = n
    }
  }
  return `Day ${maxDay + 1}`
}

export function EventFolderBar({
  eventId,
  subfolders: initialSubfolders,
  activeSubfolderId,
  totalFilesCount,
  isAdmin,
}: EventFolderBarProps) {
  const router = useRouter()
  const [subfolders, setSubfolders] = useState<SubfolderItem[]>(initialSubfolders)
  const [adding, setAdding]         = useState(false)
  const [label, setLabel]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const nextDayLabel = getNextDaySuggestion(subfolders)

  async function createFolders(labelsToCreate: string[], navigateToFirst = true) {
    if (labelsToCreate.length === 0) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/hierarchy/subfolders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ labels: labelsToCreate, eventId }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to add folder')
      }
      const createdList: SubfolderItem[] = json.subfolders ?? (json.subfolder ? [json.subfolder] : [])
      setSubfolders(prev =>
        [...prev, ...createdList].sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
        )
      )
      setLabel('')
      setAdding(false)
      router.refresh()
      if (navigateToFirst && createdList[0]) {
        router.push(`/events/${eventId}?subfolder=${createdList[0].id}`)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add folder')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    const parts = label.split(',').map(p => p.trim()).filter(Boolean)
    await createFolders(parts, true)
  }

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Folders / Days
        </p>
        {isAdmin && !adding && (
          <div className="flex items-center gap-2 flex-wrap">
            {subfolders.length === 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={() => createFolders(['Day 1', 'Day 2', 'Day 3'], true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                           bg-indigo-600/20 text-indigo-300 border border-indigo-500/30
                           hover:bg-indigo-600/30 disabled:opacity-50 transition"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Quick Add Day 1–3
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAdding(true)
                setLabel(nextDayLabel)
                setError('')
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                         bg-slate-800 text-slate-200 border border-slate-700
                         hover:bg-slate-700 hover:text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Folder
            </button>
          </div>
        )}
      </div>

      {/* Folder pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/events/${eventId}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition
            ${!activeSubfolderId
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
              : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          All files
          <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full ${
            !activeSubfolderId ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
          }`}>
            {totalFilesCount}
          </span>
        </Link>

        {subfolders.map(sf => {
          const isActive = sf.id === activeSubfolderId
          const count = sf._count?.mediaFiles ?? 0
          return (
            <Link
              key={sf.id}
              href={`/events/${eventId}?subfolder=${sf.id}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {sf.label}
              <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {count}
              </span>
            </Link>
          )
        })}

        {subfolders.length === 0 && !adding && (
          <span className="text-xs text-slate-500 ml-1">
            No day/session folders yet.{isAdmin ? ' Use "Quick Add Day 1–3" or "New Folder" to organize uploads.' : ''}
          </span>
        )}
      </div>

      {/* Inline add folder form */}
      {isAdmin && adding && (
        <form onSubmit={handleAddSubmit} className="pt-2 border-t border-slate-800/70 space-y-2">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <input
              autoFocus
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`e.g. ${nextDayLabel} (or Day 1, Day 2, Day 3)`}
              className="flex-1 min-w-[200px] bg-slate-800 border border-indigo-500/50 rounded-xl
                         px-3 py-2 text-sm text-white placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={saving || !label.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-white
                         bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add Folder
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError('') }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Tip: You can add multiple folders at once separated by commas, e.g. <span className="text-slate-300">Day 1, Day 2, Day 3</span>.
          </p>
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
