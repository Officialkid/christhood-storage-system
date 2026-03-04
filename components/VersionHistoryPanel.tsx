'use client'

/**
 * VersionHistoryPanel
 * Shows the full version history of a file.
 * Allows EDITOR / ADMIN to restore any previous version.
 * Auto-refreshes its list after a restore or when externalRefreshKey changes.
 */

import { useState, useEffect, useCallback } from 'react'
import type { AppRole } from '@/types'

interface VersionRow {
  id:            string
  versionNumber: number
  r2Key:         string
  createdAt:     string
  downloadUrl:   string
  uploadedBy:    { id: string; username: string | null; email: string }
}

interface Props {
  fileId:           string
  userRole:         AppRole
  /**
   * Increment this from the parent to trigger a data refresh
   * (e.g. after a new version is uploaded).
   */
  externalRefreshKey?: number
}

export function VersionHistoryPanel({ fileId, userRole, externalRefreshKey = 0 }: Props) {
  const [versions,     setVersions]     = useState<VersionRow[]>([])
  const [activeR2Key,  setActiveR2Key]  = useState<string>('')
  const [loading,      setLoading]      = useState(true)
  const [restoringId,  setRestoringId]  = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [refreshKey,   setRefreshKey]   = useState(0)

  const canRestore = userRole === 'EDITOR' || userRole === 'ADMIN'

  // ── fetch version list ────────────────────────────────────────────────────
  const fetchVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/media/${fileId}/versions`)
      if (!res.ok) throw new Error('Failed to load versions')
      const data = await res.json()
      setVersions(data.versions ?? [])
      setActiveR2Key(data.activeR2Key ?? '')
    } catch {
      // silently keep previous data on error
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => { fetchVersions() }, [fetchVersions, refreshKey, externalRefreshKey])

  // ── restore a version ─────────────────────────────────────────────────────
  async function handleRestore(versionId: string) {
    setRestoringId(versionId)
    setRestoreError(null)
    try {
      const res = await fetch(`/api/media/${fileId}/versions/${versionId}/restore`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Restore failed')
      }
      setRefreshKey((k) => k + 1)
    } catch (err: any) {
      setRestoreError(err.message ?? 'Unknown error')
    } finally {
      setRestoringId(null)
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function uploaderLabel(v: VersionRow) {
    return v.uploadedBy?.username ?? v.uploadedBy?.email ?? 'Unknown'
  }

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Version History
        </h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Refresh ↺
        </button>
      </div>

      {restoreError && (
        <div className="px-5 py-3 bg-red-950/40 border-b border-red-900/50 text-sm text-red-400">
          {restoreError}
        </div>
      )}

      {loading ? (
        <div className="px-5 py-10 text-center text-slate-500 text-sm">Loading…</div>
      ) : versions.length === 0 ? (
        <div className="px-5 py-10 text-center text-slate-500 text-sm">
          No versions recorded yet.
          <br />
          <span className="text-xs text-slate-600">
            Uploading a new version will create version history here.
          </span>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {[...versions].reverse().map((v) => {
            const isActive    = v.r2Key === activeR2Key
            const isRestoring = restoringId === v.id

            return (
              <div
                key={v.id}
                className={`flex items-center gap-4 px-5 py-3.5 transition-colors
                            ${isActive ? 'bg-indigo-950/20' : 'hover:bg-slate-800/40'}`}
              >
                {/* Version number */}
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center
                               text-xs font-bold shrink-0
                               ${isActive
                                 ? 'bg-indigo-600 text-white'
                                 : 'bg-slate-700 text-slate-400'
                               }`}
                >
                  v{v.versionNumber}
                </span>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium leading-tight">
                    Version {v.versionNumber}
                    {isActive && (
                      <span className="ml-2 inline-flex items-center rounded-md bg-indigo-900/70
                                        px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300
                                        ring-1 ring-inset ring-indigo-700">
                        Active
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(v.createdAt)} · by {uploaderLabel(v)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={v.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-slate-700/60 px-2.5 py-1 text-xs text-slate-300
                               hover:bg-slate-700 transition-colors"
                  >
                    Preview
                  </a>

                  {canRestore && !isActive && (
                    <button
                      disabled={!!restoringId}
                      onClick={() => handleRestore(v.id)}
                      className="rounded-md bg-violet-900/60 px-2.5 py-1 text-xs
                                 text-violet-300 ring-1 ring-inset ring-violet-800
                                 hover:bg-violet-800/60 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
