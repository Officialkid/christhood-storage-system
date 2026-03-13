'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Brain, Users, AlertTriangle, MousePointerClick, Bug, Download, RefreshCw,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface InsightData {
  period:  string
  summary: { totalLogs: number; uniqueUsers: number }
  intents: { intent: string; count: number }[]
  highFollowUp: {
    sessionId: string; messageCount: number; pageContext: string; date: string | null
  }[]
  offTopic: {
    total: number
    samples: { userMessageCleaned: string | null; pageContext: string; createdAt: string }[]
  }
  actionPatterns: { tool: string; confirmed: number; cancelled: number; expired: number }[]
  errorReports:   { userMessageCleaned: string | null; pageContext: string; createdAt: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const INTENT_COLOURS: Record<string, string> = {
  HOW_TO:         '#6366f1',
  FIND_FILE:      '#8b5cf6',
  STATUS_CHECK:   '#a78bfa',
  ERROR_REPORT:   '#f59e0b',
  ACTION_REQUEST: '#34d399',
  ACCOUNT_ISSUE:  '#fb7185',
  OFF_TOPIC:      '#64748b',
  GENERAL_CHAT:   '#94a3b8',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900 border border-slate-800/60 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-indigo-400">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function TrainingInsightsPage() {
  const [data,    setData]    = useState<InsightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [period,  setPeriod]  = useState<'week' | 'month'>('month')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/assistant/training-insights?period=${period}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message ?? 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Training Insights</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Anonymised conversation patterns — PII removed, 90-day retention
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-xl border border-slate-700 overflow-hidden">
            {(['week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={[
                  'px-4 py-2 text-sm transition-colors',
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white',
                ].join(' ')}
              >
                {p === 'week' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white
                       hover:border-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/api/admin/assistant/export-training-data"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700
                       border border-slate-700 text-sm text-white transition-colors"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            Export JSON
          </Link>
        </div>
      </div>

      {/* ── Error / Loading ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-800/40 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          Loading insights…
        </div>
      )}

      {data && (
        <>
          {/* ── Summary strip ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Log records',   value: data.summary.totalLogs.toLocaleString() },
              { label: 'Unique users',  value: data.summary.uniqueUsers.toLocaleString() },
              { label: 'Off-topic',     value: data.offTopic.total.toLocaleString() },
              { label: 'High-follow-up sessions', value: data.highFollowUp.length.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-900 border border-slate-800/60 rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Panel 1: Most Common Intents ─────────────────────────────── */}
          <SectionCard icon={<Brain className="w-4 h-4" />} title="Most Common Intents">
            {data.intents.length === 0 ? (
              <p className="text-sm text-slate-500">No intent data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.intents} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis
                    dataKey="intent" type="category"
                    tick={{ fill: '#94a3b8', fontSize: 12 }} width={120}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    itemStyle={{ color: '#a5b4fc' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.intents.map(entry => (
                      <Cell
                        key={entry.intent}
                        fill={INTENT_COLOURS[entry.intent] ?? '#6366f1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* ── Panel 2: Sessions with Many Follow-ups ───────────────────── */}
          <SectionCard icon={<Users className="w-4 h-4" />} title="Sessions with Many Follow-ups (5+ messages)">
            {data.highFollowUp.length === 0 ? (
              <p className="text-sm text-slate-500">No sessions with 5+ messages yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-800">
                      <th className="pb-2 pr-4 font-medium">Session (truncated)</th>
                      <th className="pb-2 pr-4 font-medium">Page</th>
                      <th className="pb-2 pr-4 font-medium">Messages</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.highFollowUp.map(s => (
                      <tr key={s.sessionId} className="border-b border-slate-800/40">
                        <td className="py-2 pr-4 text-slate-400 font-mono text-xs">
                          {s.sessionId.slice(0, 12)}…
                        </td>
                        <td className="py-2 pr-4 text-slate-300">{s.pageContext}</td>
                        <td className="py-2 pr-4 text-white font-semibold">{s.messageCount}</td>
                        <td className="py-2 text-slate-400">{formatDate(s.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ── Panel 3: Off-Topic Attempts ──────────────────────────────── */}
          <SectionCard icon={<AlertTriangle className="w-4 h-4" />} title="Off-Topic Attempts">
            <p className="text-sm text-slate-400 mb-3">
              {data.offTopic.total} off-topic messages in this period
            </p>
            {data.offTopic.samples.length === 0 ? (
              <p className="text-sm text-slate-500">No off-topic messages yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.offTopic.samples.map((s, i) => (
                  <li key={i} className="rounded-lg bg-slate-800/40 border border-slate-800 p-3">
                    <p className="text-sm text-slate-300 italic">
                      &ldquo;{s.userMessageCleaned ?? '[message redacted]'}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {s.pageContext} · {formatDate(s.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* ── Panel 4: Action Cancellation Patterns ────────────────────── */}
          <SectionCard
            icon={<MousePointerClick className="w-4 h-4" />}
            title="Action Cancellation Patterns"
          >
            {data.actionPatterns.length === 0 ? (
              <p className="text-sm text-slate-500">No action proposals recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-800">
                      <th className="pb-2 pr-4 font-medium">Tool</th>
                      <th className="pb-2 pr-4 font-medium text-green-400">Confirmed</th>
                      <th className="pb-2 pr-4 font-medium text-red-400">Cancelled</th>
                      <th className="pb-2 font-medium text-slate-500">Expired</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.actionPatterns.map(a => (
                      <tr key={a.tool} className="border-b border-slate-800/40">
                        <td className="py-2 pr-4 text-white font-mono text-xs">{a.tool}</td>
                        <td className="py-2 pr-4 text-green-400 font-semibold">{a.confirmed}</td>
                        <td className="py-2 pr-4 text-red-400 font-semibold">{a.cancelled}</td>
                        <td className="py-2 text-slate-500">{a.expired}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ── Panel 5: Error Report Topics ─────────────────────────────── */}
          <SectionCard icon={<Bug className="w-4 h-4" />} title="Error Report Topics">
            {data.errorReports.length === 0 ? (
              <p className="text-sm text-slate-500">No error reports in this period.</p>
            ) : (
              <ul className="space-y-2">
                {data.errorReports.map((r, i) => (
                  <li key={i} className="rounded-lg bg-amber-900/10 border border-amber-800/30 p-3">
                    <p className="text-sm text-slate-300 italic">
                      &ldquo;{r.userMessageCleaned ?? '[message redacted]'}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {r.pageContext} · {formatDate(r.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
