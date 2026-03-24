'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Bot, RefreshCw, AlertCircle, Loader2, MessageSquare, Users,
  Zap, Clock, AlertTriangle, CheckCircle, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month'

interface ZaraAnalyticsData {
  overview: {
    totalConversations: number
    uniqueUsers:        number
    totalUsers:         number
    actionsTaken:       number
    avgResponseTimeMs:  number
  }
  usageOverTime:    { date: string; conversations: number; actionsTaken: number }[]
  topTools:         { toolName: string; callCount: number }[]
  actionConversion: { confirmed: number; cancelled: number; expired: number }
  usageByUser: {
    userId: string; name: string; username: string; role: string
    conversations: number; lastUsed: string; mostUsedFeature: string
  }[]
  usageByPage:  { page: string; count: number; percentage: number }[]
  errorRate:    { date: string; errorRate: number; hasSpike: boolean }[]
  geminiUsage: {
    dailyRequests: number; dailyRequestsLimit: number
    peakRpm:       number; rpmLimit:           number
    tokensToday:   number; tokensLimit:        number
  }
  recentActions: {
    id: string; actionType: string; riskLevel: string; status: string
    confirmedAt: string
    requestedBy: { name: string | null; username: string | null }
  }[]
  period:      string
  generatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMs(ms: number): string {
  if (!ms) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function fmtToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({
  title, children, headerRight,
}: { title: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const opts: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today'   },
    { value: 'week',  label: '7 days'  },
    { value: 'month', label: '30 days' },
  ]
  return (
    <div className="flex gap-0.5 bg-slate-800/70 rounded-lg p-0.5">
      {opts.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition
            ${period === o.value
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function OverviewCard({ icon: Icon, label, value, sub, colour }: {
  icon: React.ElementType; label: string; value: string; sub?: string; colour: string
}) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className={`inline-flex p-2.5 rounded-xl ${colour}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

function GeminiBar({ label, value, limit, unit = '' }: {
  label: string; value: number; limit: number; unit?: string
}) {
  const pct       = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0
  const barColour = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'
  const txtColour = pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-slate-300'
  const fmt       = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString()

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        {pct === 0 && value === 0 ? (
          <span className="text-slate-600">Not tracked</span>
        ) : (
          <span className={`font-semibold ${txtColour}`}>
            {fmt(value)}{unit} / {fmt(limit)}{unit}
            <span className="text-slate-500 font-normal ml-1">({pct}%)</span>
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pct > 0 ? barColour : 'bg-slate-700'}`}
          style={{ width: pct > 0 ? `${pct}%` : '3px' }}
        />
      </div>
    </div>
  )
}

const RISK_COLOURS: Record<string, string> = {
  SAFE:      'bg-green-900/30 text-green-400 border border-green-900/50',
  MODERATE:  'bg-amber-900/30 text-amber-400 border border-amber-900/50',
  SENSITIVE: 'bg-orange-900/30 text-orange-300 border border-orange-900/50',
  HIGH:      'bg-red-900/30 text-red-300 border border-red-900/50',
  CRITICAL:  'bg-red-800/50 text-red-200 border border-red-700/60',
}

const ACTION_STATUS_COLOURS: Record<string, string> = {
  EXECUTED:    'text-green-400',
  PENDING:     'text-amber-400',
  FAILED:      'text-red-400',
  ROLLED_BACK: 'text-slate-400',
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN:    'bg-indigo-900/40 text-indigo-300',
  EDITOR:   'bg-violet-900/40 text-violet-300',
  UPLOADER: 'bg-slate-800 text-slate-400',
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color ?? p.fill }}>●</span>
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-semibold">
            {(p.value as number).toLocaleString()}
            {p.name === 'Error rate' ? '%' : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function SpikeDot(props: any) {
  const { cx, cy, payload } = props
  if (payload?.hasSpike) {
    return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#1e293b" strokeWidth={1.5} />
  }
  return <circle cx={cx} cy={cy} r={3} fill="#6366f1" stroke="#1e293b" strokeWidth={1} />
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ZaraAnalyticsTab() {
  const [data,       setData      ] = useState<ZaraAnalyticsData | null>(null)
  const [loading,    setLoading   ] = useState(true)
  const [error,      setError     ] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [period,     setPeriod    ] = useState<Period>('week')

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else        setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/analytics/zara?period=${period}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message ?? 'Failed to load AI analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Loading AI Assistant analytics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-red-400">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm">{error}</p>
        <button
          onClick={() => fetchData()}
          className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const {
    overview, usageOverTime, topTools, actionConversion,
    usageByUser, usageByPage, errorRate, geminiUsage, recentActions,
  } = data

  // Donut data
  const totalProposed = actionConversion.confirmed + actionConversion.cancelled + actionConversion.expired
  const donutData = [
    { name: 'Confirmed', value: actionConversion.confirmed, fill: '#22c55e' },
    { name: 'Cancelled', value: actionConversion.cancelled, fill: '#64748b' },
    { name: 'Expired',   value: actionConversion.expired,   fill: '#ef4444' },
  ].filter(d => d.value > 0)

  const maxToolCount = topTools.length > 0 ? topTools[0].callCount : 1

  return (
    <div className="space-y-6">

      {/* ── Period + refresh controls ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-slate-500">
          Last updated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
        <div className="flex items-center gap-2">
          <PeriodToggle period={period} onChange={p => setPeriod(p)} />
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700
                       disabled:opacity-50 text-xs text-slate-300 font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Panel 1: Overview cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewCard
          icon={MessageSquare} label="Total Conversations"
          value={overview.totalConversations.toLocaleString()}
          colour="bg-indigo-600/20 text-indigo-400"
        />
        <OverviewCard
          icon={Users} label="Unique Users"
          value={String(overview.uniqueUsers)}
          sub={`out of ${overview.totalUsers} total`}
          colour="bg-violet-600/20 text-violet-400"
        />
        <OverviewCard
          icon={Zap} label="Actions Taken"
          value={overview.actionsTaken.toLocaleString()}
          colour="bg-emerald-600/20 text-emerald-400"
        />
        <OverviewCard
          icon={Clock} label="Avg Response Time"
          value={fmtMs(overview.avgResponseTimeMs)}
          colour="bg-sky-600/20 text-sky-400"
        />
      </div>

      {/* ── Panel 2: Usage over time ──────────────────────────────────────── */}
      <Section title="Usage over time">
        {usageOverTime.length === 0 ? (
          <p className="text-sm text-slate-600 py-8 text-center">No sessions recorded in this period.</p>
        ) : (
          <div className="h-56">
              <ResponsiveContainer width="100%" height={224}>
              <LineChart data={usageOverTime} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconSize={10}
                  formatter={v => <span className="text-slate-400 text-xs">{v}</span>}
                />
                <Line
                  type="monotone" dataKey="conversations" name="Conversations"
                  stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone" dataKey="actionsTaken" name="Actions taken"
                  stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ── Panels 3 + 4 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Panel 3: Most used tools */}
        <Section title="Most used tools">
          {topTools.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">No tool calls recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {topTools.map(t => (
                <div key={t.toolName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium truncate max-w-[180px]">
                      {fmtToolName(t.toolName)}
                    </span>
                    <span className="text-slate-500 shrink-0 ml-2 tabular-nums">
                      {t.callCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                      style={{ width: `${Math.max(4, (t.callCount / maxToolCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Panel 4: Action conversion donut */}
        <Section title="Action conversion rate">
          {donutData.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">No actions proposed yet.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72}
                      paddingAngle={3} dataKey="value"
                    >
                      {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => [
                        `${(v as number).toLocaleString()} (${
                          totalProposed > 0 ? Math.round(((v as number) / totalProposed) * 100) : 0
                        }%)`,
                        '',
                      ]}
                      contentStyle={{
                        background: '#1e293b', border: '1px solid #334155',
                        borderRadius: '12px', fontSize: 12,
                      }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-white">{totalProposed}</span>
                  <span className="text-[10px] text-slate-500">proposed</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-4 text-xs">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                    <span className="text-slate-400">{d.name}</span>
                    <span className="text-white font-semibold">
                      {totalProposed > 0 ? Math.round((d.value / totalProposed) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* ── Panel 5: Usage by user ────────────────────────────────────────── */}
      <Section title="Usage by user">
        {usageByUser.length === 0 ? (
          <p className="text-sm text-slate-600 py-8 text-center">No user sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Name', 'Role', 'Conversations', 'Last Used', 'Most Used Tool'].map(h => (
                    <th
                      key={h}
                      className={`py-2 text-xs font-medium text-slate-500 uppercase tracking-wide
                        ${h === 'Conversations' ? 'text-right pr-4' : 'text-left pr-4'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usageByUser.map(u => (
                  <tr key={u.userId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 pr-4">
                      <p className="text-slate-200 font-medium truncate max-w-[150px]">{u.name}</p>
                      {u.username && <p className="text-[10px] text-slate-600">@{u.username}</p>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                        ${ROLE_BADGE[u.role] ?? ROLE_BADGE.UPLOADER}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className="text-slate-300 font-semibold tabular-nums">{u.conversations}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">{u.lastUsed}</td>
                    <td className="py-2.5 text-slate-400 text-xs truncate max-w-[140px]">
                      {fmtToolName(u.mostUsedFeature)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Panels 6 + 7 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Panel 6: Usage by page */}
        <Section title="Usage by page">
          {usageByPage.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">No page context recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {usageByPage.map(p => (
                <div key={p.page} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate max-w-[180px]">{p.page || '(unknown)'}</span>
                    <span className="text-slate-500 shrink-0 ml-2 tabular-nums">
                      {p.percentage}% <span className="text-slate-600">({p.count})</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-700"
                      style={{ width: `${Math.max(2, p.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Panel 7: Error rate monitor */}
        <Section title="Error rate monitor">
          {errorRate.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">No data in this period.</p>
          ) : errorRate.every(r => r.errorRate === 0) ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-green-400">
              <CheckCircle className="w-8 h-8" />
              <p className="text-sm font-medium">No errors in this period</p>
              <p className="text-xs text-slate-600">All sessions completed without errors.</p>
            </div>
          ) : (
            <>
              {errorRate.some(r => r.hasSpike) && (
                <div className="flex items-center gap-2 rounded-lg bg-red-950/40 border border-red-900/40
                                px-3 py-2 text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Error spikes detected (&gt;10%) — investigate to prevent degraded experience.</span>
                </div>
              )}
              <div className="h-48">
                <ResponsiveContainer width="100%" height={192}>
                  <LineChart data={errorRate} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => `${v}%`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone" dataKey="errorRate" name="Error rate"
                      stroke="#6366f1" strokeWidth={2}
                      dot={<SpikeDot />}
                      activeDot={{ r: 4, fill: '#ef4444' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Section>
      </div>

      {/* ── Panel 8: Gemini free tier ─────────────────────────────────────── */}
      <Section title="Gemini free tier usage">
        {(geminiUsage.dailyRequests / geminiUsage.dailyRequestsLimit) >= 1 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-700/50
                          px-3 py-2 text-xs text-red-300 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Daily request limit reached — API may be returning 429 errors.
          </div>
        )}
        <div className="space-y-5">
          <GeminiBar
            label="Daily requests (estimated)"
            value={geminiUsage.dailyRequests}
            limit={geminiUsage.dailyRequestsLimit}
          />
          <GeminiBar
            label="Peak requests / min"
            value={geminiUsage.peakRpm}
            limit={geminiUsage.rpmLimit}
            unit=" RPM"
          />
          <GeminiBar
            label="Tokens today (estimated)"
            value={geminiUsage.tokensToday}
            limit={geminiUsage.tokensLimit}
          />
        </div>
        <p className="text-xs text-slate-600 pt-1">
          Free tier limits: 1,500 req/day · 15 RPM · 1M tokens/day (Gemini 2.0 Flash).
          Request count is estimated from session message counts.
          RPM and token figures require server-side instrumentation.
        </p>
      </Section>

      {/* ── Panel 9: ZaraActionLog summary ───────────────────────────────── */}
      <Section
        title="Recent AI actions"
        headerRight={
          <Link
            href="/admin/assistant"
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
          >
            View full log <ExternalLink className="w-3 h-3" />
          </Link>
        }
      >
        {recentActions.length === 0 ? (
          <p className="text-sm text-slate-600 py-6 text-center">No confirmed actions recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentActions.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2.5 gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0
                    ${RISK_COLOURS[a.riskLevel] ?? RISK_COLOURS.MODERATE}`}>
                    {a.riskLevel}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 font-medium truncate">
                      {fmtToolName(a.actionType)}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      by {a.requestedBy?.name ?? '—'} ·{' '}
                      {new Date(a.confirmedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}{' '}
                      {new Date(a.confirmedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold shrink-0
                  ${ACTION_STATUS_COLOURS[a.status] ?? 'text-slate-400'}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

    </div>
  )
}
