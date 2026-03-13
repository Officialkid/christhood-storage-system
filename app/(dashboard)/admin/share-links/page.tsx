'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Share2, RefreshCw, Loader2, ExternalLink, Trash2,
  Lock, Clock, Check, AlertCircle, Eye, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatDistanceToNow, isPast } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminShareLink {
  id:           string
  token:        string
  title:        string
  linkType:     string
  createdBy:    { username: string | null; email: string }
  expiresAt:    string
  isRevoked:    boolean
  isExpired:    boolean
  hasPin:       boolean
  downloadCount: number
  accessCount:  number
  url:          string
  createdAt:    string
  maxDownloads: number | null
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusPill({ link }: { link: AdminShareLink }) {
  if (link.isRevoked) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
      <Trash2 className="w-2.5 h-2.5" />Revoked
    </span>
  )
  if (link.isExpired) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 border border-slate-600/30">
      <Clock className="w-2.5 h-2.5" />Expired
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <Check className="w-2.5 h-2.5" />Active
    </span>
  )
}

function TypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    FILE:     'bg-sky-500/10 text-sky-400 border-sky-500/20',
    EVENT:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    TRANSFER: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${colors[type] ?? 'bg-slate-700 text-slate-400 border-slate-600'}`}>
      {type}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminShareLinksPage() {
  const [links,       setLinks]       = useState<AdminShareLink[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [showRevoked, setShowRevoked] = useState(false)
  const [revoking,    setRevoking]    = useState<string | null>(null)
  const [sortField,   setSortField]   = useState<'createdAt' | 'expiresAt' | 'accessCount'>('createdAt')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')

  const fetchLinks = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/admin/share-links${showRevoked ? '?showRevoked=true' : ''}`)
      const data = await res.json() as { links?: AdminShareLink[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to load.'); return }
      setLinks(data.links ?? [])
    } catch {
      setError('Network error — please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [showRevoked])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  async function revokeLink(token: string) {
    if (!confirm('Revoke this share link? Recipients will no longer be able to access it.')) return
    setRevoking(token)
    try {
      const res = await fetch(`/api/share/${token}`, { method: 'DELETE' })
      if (!res.ok) { alert('Failed to revoke link.'); return }
      setLinks(prev => prev.map(l => l.token === token ? { ...l, isRevoked: true } : l))
    } catch {
      alert('Network error.')
    } finally {
      setRevoking(null)
    }
  }

  // Sort
  const sorted = [...links].sort((a, b) => {
    let av: number | string, bv: number | string
    if (sortField === 'createdAt')   { av = a.createdAt;   bv = b.createdAt }
    else if (sortField === 'expiresAt') { av = a.expiresAt; bv = b.expiresAt }
    else { av = a.accessCount; bv = b.accessCount }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(field: typeof sortField) {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-slate-600" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-slate-400" />
      : <ChevronDown className="w-3 h-3 text-slate-400" />
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Share2 className="w-6 h-6 text-indigo-400" />
            Share Links
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            All external share links — monitor access and revoke as needed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={e => setShowRevoked(e.target.checked)}
              className="accent-indigo-500"
            />
            Show revoked
          </label>
          <button
            onClick={fetchLinks}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700
                       border border-slate-700 text-slate-400 hover:text-white text-sm transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total links',   value: links.length },
            { label: 'Active',        value: links.filter(l => !l.isRevoked && !l.isExpired).length },
            { label: 'Expired',       value: links.filter(l => l.isExpired && !l.isRevoked).length },
            { label: 'Total accesses', value: links.reduce((s, l) => s + l.accessCount, 0) },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Share2 className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-slate-400 font-medium">No share links found</p>
              <p className="text-sm text-slate-600 mt-1">Links created by users will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Title / Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Created by</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 select-none"
                      onClick={() => toggleSort('expiresAt')}
                    >
                      <span className="flex items-center gap-1">Expiry <SortIcon field="expiresAt" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 select-none"
                      onClick={() => toggleSort('accessCount')}
                    >
                      <span className="flex items-center gap-1">Accesses <SortIcon field="accessCount" /></span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {sorted.map(link => (
                    <tr key={link.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-200 truncate max-w-[200px]">{link.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <TypePill type={link.linkType} />
                              {link.hasPin && (
                                <span title="PIN protected">
                                  <Lock className="w-3 h-3 text-amber-400" />
                                </span>
                              )}
                              {link.maxDownloads !== null && (
                                <span className="text-xs text-slate-600">{link.downloadCount}/{link.maxDownloads} dl</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {link.createdBy.username ?? link.createdBy.email}
                      </td>
                      <td className="px-4 py-3">
                        {link.isExpired || link.isRevoked ? (
                          <span className="text-slate-600 text-xs">
                            {new Date(link.expiresAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">
                            {formatDistanceToNow(new Date(link.expiresAt), { addSuffix: true })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-slate-300">
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          {link.accessCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill link={link} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open link"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700/60 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          {!link.isRevoked && (
                            <button
                              onClick={() => revokeLink(link.token)}
                              disabled={revoking === link.token}
                              title="Revoke link"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                            >
                              {revoking === link.token
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
