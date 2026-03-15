'use client'

import { useState } from 'react'
import { AlertTriangle, Copy, X, ArrowUp, SkipForward, CheckCircle2 } from 'lucide-react'

// ─────────────────────────────────────────── Types ───────────────────────────

export interface DuplicateInfo {
  id:           string
  originalName: string
  storedName:   string
  fileSize:     string      // BigInt serialised as string
  uploadedAt:   string      // ISO date
  uploaderName: string
}

export interface DuplicateEntry {
  uid:       string          // local UploadFile uid
  name:      string
  size:      number
  duplicate: DuplicateInfo
}

export type DuplicateAction = 'upload-as-version' | 'skip' | 'upload-anyway'

export interface DuplicateResolution {
  uid:    string
  action: DuplicateAction
}

interface Props {
  entries:   DuplicateEntry[]
  onResolve: (resolutions: DuplicateResolution[]) => void
  onCancel:  () => void
}

// ─────────────────────────────────────── Helpers ─────────────────────────────

function fmt(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const ACTION_LABELS: Record<DuplicateAction, string> = {
  'upload-as-version': 'Upload as v2',
  'skip':              'Skip',
  'upload-anyway':     'Upload anyway',
}

const ACTION_STYLES: Record<DuplicateAction, string> = {
  'upload-as-version': 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/35',
  'skip':              'bg-slate-700/40  border-slate-600/40  text-slate-400  hover:bg-slate-700/60',
  'upload-anyway':     'bg-amber-600/15  border-amber-500/35  text-amber-300   hover:bg-amber-600/25',
}

const ALL_ACTIONS: DuplicateAction[] = ['upload-as-version', 'skip', 'upload-anyway']

// ─────────────────────────────────────── Component ───────────────────────────

export default function DuplicateCheckDialog({ entries, onResolve, onCancel }: Props) {
  const [choices, setChoices] = useState<Record<string, DuplicateAction>>(
    () => Object.fromEntries(entries.map(e => [e.uid, 'upload-as-version'])),
  )
  const [applyAll, setApplyAll] = useState(false)

  function setChoice(uid: string, action: DuplicateAction) {
    if (applyAll) {
      setChoices(Object.fromEntries(entries.map(e => [e.uid, action])))
    } else {
      setChoices(prev => ({ ...prev, [uid]: action }))
    }
  }

  function handleApplyAllChange(checked: boolean) {
    setApplyAll(checked)
    if (checked) {
      // Apply the first file's current choice to all
      const first = entries[0]
      if (first) {
        const current = choices[first.uid]
        setChoices(Object.fromEntries(entries.map(e => [e.uid, current])))
      }
    }
  }

  function confirm() {
    const resolutions: DuplicateResolution[] = entries.map(e => ({
      uid:    e.uid,
      action: choices[e.uid] ?? 'skip',
    }))
    onResolve(resolutions)
  }

  const hasSingleEntry = entries.length === 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">
              {hasSingleEntry ? 'Duplicate File Detected' : `${entries.length} Duplicate Files Detected`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasSingleEntry
                ? 'This file already exists in this event.'
                : 'These files already exist in this event. Choose what to do with each.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File list */}
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          {entries.map((entry, idx) => {
            const choice = choices[entry.uid]
            const existingDate = new Date(entry.duplicate.uploadedAt).toLocaleDateString(undefined, {
              day: '2-digit', month: 'short', year: 'numeric',
            })
            return (
              <div
                key={entry.uid}
                className={`px-6 py-4 space-y-3 ${idx < entries.length - 1 ? 'border-b border-slate-800' : ''}`}
              >
                {/* File name + size */}
                <div className="flex items-start gap-2">
                  <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-slate-500">{fmt(entry.size)}</p>
                  </div>
                </div>

                {/* Existing file info */}
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5 text-xs text-slate-400 space-y-1">
                  <p className="font-medium text-slate-300">Existing file</p>
                  <p>Uploaded by <span className="text-white">{entry.duplicate.uploaderName}</span> on {existingDate}</p>
                  <p className="text-slate-500 truncate">{entry.duplicate.storedName}</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {ALL_ACTIONS.map(action => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setChoice(entry.uid, action)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition
                        ${ACTION_STYLES[action]}
                        ${choice === action ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-current opacity-100' : 'opacity-75'}
                      `}
                    >
                      {action === 'upload-as-version' && <ArrowUp className="w-3 h-3" />}
                      {action === 'skip'              && <SkipForward className="w-3 h-3" />}
                      {action === 'upload-anyway'     && <Copy className="w-3 h-3" />}
                      {ACTION_LABELS[action]}
                      {choice === action && <CheckCircle2 className="w-3 h-3 opacity-80" />}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 space-y-3">
          {/* Apply-to-all row (only when > 1 entry) */}
          {!hasSingleEntry && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={e => handleApplyAllChange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
              />
              <span className="text-xs text-slate-400">Apply same choice to all duplicates</span>
            </label>
          )}

          {/* Action summary */}
          <div className="text-xs text-slate-500">
            {Object.values(choices).filter(c => c === 'upload-as-version').length > 0 && (
              <span className="text-indigo-400">
                {Object.values(choices).filter(c => c === 'upload-as-version').length} will be uploaded as new versions.{' '}
              </span>
            )}
            {Object.values(choices).filter(c => c === 'skip').length > 0 && (
              <span>
                {Object.values(choices).filter(c => c === 'skip').length} will be skipped.{' '}
              </span>
            )}
            {Object.values(choices).filter(c => c === 'upload-anyway').length > 0 && (
              <span className="text-amber-400">
                {Object.values(choices).filter(c => c === 'upload-anyway').length} will be uploaded as new files.{' '}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 text-sm hover:text-white hover:border-slate-600 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500
                         text-white text-sm font-semibold transition shadow-lg shadow-indigo-500/20"
            >
              Confirm &amp; Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
