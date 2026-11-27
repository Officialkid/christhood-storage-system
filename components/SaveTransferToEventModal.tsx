'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FolderPlus, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { HierarchyYear } from '@/types'
import { useToast } from '@/lib/toast'

interface Props {
  transferId: string
  source:     'response' | 'original'
  fileCount:  number
  onClose:    () => void
}

export function SaveTransferToEventModal({ transferId, source, fileCount, onClose }: Props) {
  const router = useRouter()
  const toast  = useToast()
  const [years, setYears]           = useState<HierarchyYear[]>([])
  const [loading, setLoading]       = useState(true)
  const [selYear, setSelYear]       = useState('')
  const [selCat, setSelCat]         = useState('')
  const [selEventId, setSelEventId] = useState('')
  const [selSubId, setSelSubId]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    fetch('/api/hierarchy')
      .then(r => r.json())
      .then(d => {
        const yrs: HierarchyYear[] = d.years ?? []
        setYears(yrs)
        if (yrs[0]) setSelYear(String(yrs[0].year))
      })
      .catch(() => setError('Failed to load event folders'))
      .finally(() => setLoading(false))
  }, [])

  const yearObj    = years.find(y => String(y.year) === selYear)
  const categories = yearObj?.categories.filter(c => !c.isArchived) ?? []
  const catObj     = categories.find(c => c.name === selCat)
  const events     = catObj?.events ?? []
  const eventObj   = events.find(e => e.id === selEventId)
  const subfolders = eventObj?.subfolders ?? []

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!selEventId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/transfers/${transferId}/save-to-event`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          eventId:     selEventId,
          subfolderId: selSubId || null,
          source,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save files to event')
      toast.success(`Saved ${data.importedCount} file${data.importedCount !== 1 ? 's' : ''} directly to ${eventObj?.name ?? 'event'}!`)
      onClose()
      router.push(`/events/${selEventId}${selSubId ? `?subfolder=${selSubId}` : ''}`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save files')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30">
              <FolderPlus className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Save to CMMS Event</h2>
              <p className="text-xs text-slate-400">Import {fileCount} file{fileCount !== 1 ? 's' : ''} without re-uploading</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleImport} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-400">Year</label>
              <select
                value={selYear}
                onChange={e => { setSelYear(e.target.value); setSelCat(''); setSelEventId(''); setSelSubId('') }}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white"
              >
                {years.map(y => <option key={y.id} value={String(y.year)}>{y.year}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400">Category</label>
              <select
                value={selCat}
                onChange={e => { setSelCat(e.target.value); setSelEventId(''); setSelSubId('') }}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white"
              >
                <option value="">— Select category —</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400">Event</label>
              <select
                value={selEventId}
                disabled={!selCat}
                onChange={e => { setSelEventId(e.target.value); setSelSubId('') }}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white disabled:opacity-50"
              >
                <option value="">— Select event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>

            {subfolders.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-400">Folder / Day (optional)</label>
                <select
                  value={selSubId}
                  onChange={e => setSelSubId(e.target.value)}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white"
                >
                  <option value="">Event root</option>
                  {subfolders.map(sf => <option key={sf.id} value={sf.id}>{sf.label}</option>)}
                </select>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 border border-slate-700 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !selEventId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Files
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
