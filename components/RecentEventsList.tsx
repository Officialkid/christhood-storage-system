'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarDays, ArrowRight, Pencil, Trash2, X, Check, Loader2, AlertTriangle,
} from 'lucide-react'

interface EventItem {
  id:   string
  name: string
  date: string        // ISO string
  category: {
    name: string
    year: { year: number }
  }
  _count: { mediaFiles: number }
}

interface Props {
  events:  EventItem[]
  isAdmin: boolean
}

export function RecentEventsList({ events: initialEvents, isAdmin }: Props) {
  const router                  = useRouter()
  const [events, setEvents]     = useState(initialEvents)
  const [editing, setEditing]   = useState<string | null>(null)  // event id being edited
  const [editName, setEditName] = useState('')
  const [editDate, setEditDate] = useState('')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)  // id awaiting confirm

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  function startEdit(ev: EventItem) {
    setEditing(ev.id)
    setEditName(ev.name)
    // Format date as YYYY-MM-DD for the date input
    setEditDate(new Date(ev.date).toISOString().substring(0, 10))
  }

  function cancelEdit() {
    setEditing(null)
    setEditName('')
    setEditDate('')
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/hierarchy/events/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: editName.trim(), date: editDate }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')

      setEvents(evs => evs.map(e =>
        e.id === id
          ? { ...e, name: editName.trim(), date: new Date(editDate).toISOString() }
          : e
      ))
      cancelEdit()
      showToast('Event renamed.', true)
      router.refresh()
    } catch (err: any) {
      showToast(err.message, false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(id: string) {
    setConfirmDel(null)
    setDeleting(id)
    try {
      const res = await fetch(`/api/hierarchy/events/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete')

      setEvents(evs => evs.filter(e => e.id !== id))
      showToast('Event deleted.', true)
      router.refresh()
    } catch (err: any) {
      showToast(err.message, false)
    } finally {
      setDeleting(null)
    }
  }

  if (events.length === 0) return null

  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-4">Recent Events</h2>

      <div className="space-y-2">
        {events.map(event => {
          const isEditing   = editing   === event.id
          const isDeleting  = deleting  === event.id
          const needsConfirm = confirmDel === event.id

          const dateStr = new Date(event.date).toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
          })

          return (
            <div
              key={event.id}
              className="flex items-center gap-4 px-4 py-3 bg-slate-900/50
                         border border-slate-800/50 rounded-xl hover:border-slate-700
                         hover:bg-slate-900 transition-all group"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-slate-400" />
              </div>

              {/* Content — either edit form or read-only row */}
              {isEditing ? (
                <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
                  <input
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5
                               text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2
                               focus:ring-indigo-500"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Event name"
                    autoFocus
                  />
                  <input
                    type="date"
                    className="w-40 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5
                               text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                  />
                </div>
              ) : (
                <Link href={`/events/${event.id}`} className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{event.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {event.category.year.year} · {event.category.name} · {dateStr}
                  </p>
                </Link>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => saveEdit(event.id)}
                      disabled={saving}
                      title="Save changes"
                      className="flex items-center justify-center w-7 h-7 rounded-lg
                                 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors
                                 disabled:opacity-50"
                    >
                      {saving
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />
                      }
                    </button>
                    <button
                      onClick={cancelEdit}
                      title="Cancel"
                      className="flex items-center justify-center w-7 h-7 rounded-lg
                                 bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : needsConfirm ? (
                  <>
                    <span className="text-xs text-red-400 hidden sm:block">Delete?</span>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      title="Confirm delete"
                      className="flex items-center justify-center w-7 h-7 rounded-lg
                                 bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      title="Cancel"
                      className="flex items-center justify-center w-7 h-7 rounded-lg
                                 bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-slate-500">
                      {event._count.mediaFiles} files
                    </span>

                    {/* Admin-only edit/delete */}
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => startEdit(event)}
                          title="Rename event"
                          className="flex items-center justify-center w-7 h-7 rounded-lg
                                     opacity-0 group-hover:opacity-100 text-slate-400
                                     hover:text-white hover:bg-slate-700 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDel(event.id)}
                          disabled={isDeleting}
                          title="Delete event"
                          className="flex items-center justify-center w-7 h-7 rounded-lg
                                     opacity-0 group-hover:opacity-100 text-slate-400
                                     hover:text-red-400 hover:bg-red-500/10 transition-all
                                     disabled:opacity-50"
                        >
                          {isDeleting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </>
                    )}

                    <Link href={`/events/${event.id}`}>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl
                         shadow-xl border text-sm font-medium animate-in slide-in-from-bottom-4
                         ${toast.ok
                           ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                           : 'bg-red-950 border-red-800 text-red-300'
                         }`}>
          {toast.ok
            ? <Check className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />
          }
          {toast.msg}
        </div>
      )}
    </section>
  )
}
