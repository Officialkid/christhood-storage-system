'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter }    from 'next/navigation'
import { useSession }   from 'next-auth/react'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import {
  BarChart2, RefreshCw, HardDrive, Trash2, Camera, Video,
  Upload, Download, Users, FolderOpen, Calendar, AlertCircle, Loader2, Bot,
} from 'lucide-react'
import ZaraAnalyticsTab from '@/components/ZaraAnalyticsTab'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

function fmtBytesShort(bytes: number) {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + 'G'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(0)     + 'M'
  return (bytes / 1024).toFixed(0) + 'K'
}

// ── Colour palettes ───────────────────────────────────────────────────────────
const STATUS_COLOUR: Record<string, string> = {
  RAW:                 '#64748b',
  EDITING_IN_PROGRESS: '#eab308',
  EDITED:              '#3b82f6',
  PUBLISHED:           '#22c55e',
  ARCHIVED:            '#f59e0b',
  DELETED:             '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
  RAW: 'Raw', EDITING_IN_PROGRESS: 'Editing', EDITED: 'Edited',
  PUBLISHED: 'Published', ARCHIVED: 'Archived', DELETED: 'Trash',
}

const PIE_COLOURS = ['#6366f1', '#a855f7', '#06b6d4', '#f59e0b', '#22c55e', '#ef4444']
const BAR_INDIGO  = '#6366f1'
const BAR_VIOLET  = '#8b5cf6'

// ── Types ─────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  overview: {
    totalBytes: number; totalFiles: number; limitBytes: number; limitGB: number
    trashBytes: number; trashFiles: number; usedPct: number
  }
  byStatus:   { status: string;    fileCount: number; totalBytes: number }[]
  byFileType: { fileType: string;  fileCount: number; totalBytes: number }[]
  byYear:     { year: number;      fileCount: number; totalBytes: number }[]
  byCategory: { category: string;  fileCount: number; totalBytes: number }[]
  monthly:    { month: string; label: string; uploadCount: number; totalBytes: number }[]
  topUploaders:   { id: string; name: string; fileCount: number; totalBytes: number }[]
  mostDownloaded: { id: string; originalName: string; fileType: string; eventName: string; downloadCount: number }[]
  generatedAt: string
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function BytesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="text-white font-semibold">
            {p.name.toLowerCase().includes('bytes') ? fmtBytes(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

function UploadTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-white font-semibold">{p?.value?.toLocaleString()} uploads</p>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, colour }: {
  icon: any; label: string; value: string; sub?: string; colour: string
}) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`p-2.5 rounded-xl ${colour}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [data,      setData     ] = useState<AnalyticsData | null>(null)
  const [loading,   setLoading  ] = useState(true)
  const [error,     setError    ] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab,  setActiveTab ] = useState<'storage' | 'zara'>('storage')

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else        setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/analytics')
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (authStatus === 'unauthenticated') { router.push('/login'); return }
    if (authStatus === 'authenticated') {
      if (session?.user?.role !== 'ADMIN') { router.push('/dashboard'); return }
      fetchData()
    }
  }, [authStatus, session, router, fetchData])

  if (authStatus === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Loading analytics…</p>
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

  const { overview, byStatus, byFileType, byYear, byCategory, monthly, topUploaders, mostDownloaded } = data

  const usedGB  = (overview.totalBytes / 1_073_741_824).toFixed(2)
  const trashGB = (overview.trashBytes / 1_073_741_824).toFixed(3)

  // Prepare pie sectors for file-type donut
  const pieData = byFileType.map(r => ({
    name:  r.fileType === 'PHOTO' ? 'Photos' : 'Videos',
    value: r.fileCount,
    bytes: r.totalBytes,
  }))

  // Status bars sorted by count
  const statusBars = [...byStatus].sort((a, b) => b.fileCount - a.fileCount)

  // Storage by year for bar chart
  const yearBars = [...byYear].sort((a, b) => a.year - b.year)

  // Storage by category (top 8 for readability)
  const catBars = byCategory.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-400" />
            Analytics
          </h1>
          {activeTab === 'storage' && (
            <p className="text-xs text-slate-500 mt-1">
              Last updated {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab switcher */}
          <div className="flex gap-0.5 bg-slate-800/60 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${activeTab === 'storage'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'}`}
            >
              <HardDrive className="w-3.5 h-3.5" /> Storage
            </button>
            <button
              onClick={() => setActiveTab('zara')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${activeTab === 'zara'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'}`}
            >
              <Bot className="w-3.5 h-3.5" /> AI Assistant
            </button>
          </div>
          {/* Refresh button (storage tab only) */}
          {activeTab === 'storage' && (
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700
                         disabled:opacity-50 text-sm text-slate-300 font-medium transition"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {activeTab === 'zara' ? (
        <ZaraAnalyticsTab />
      ) : (
        <>
      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={HardDrive}
          label="Storage used"
          value={`${usedGB} GB`}
          sub={`of ${overview.limitGB} GB capacity`}
          colour="bg-indigo-600/20 text-indigo-400"
        />
        <StatCard
          icon={Upload}
          label="Total files"
          value={overview.totalFiles.toLocaleString()}
          colour="bg-violet-600/20 text-violet-400"
        />
        <StatCard
          icon={Trash2}
          label="Trash storage"
          value={`${trashGB} GB`}
          sub={`${overview.trashFiles} files pending purge`}
          colour="bg-rose-600/20 text-rose-400"
        />
        <StatCard
          icon={Camera}
          label="Photos vs Videos"
          value={`${byFileType.find(f => f.fileType === 'PHOTO')?.fileCount?.toLocaleString() ?? 0} / ${byFileType.find(f => f.fileType === 'VIDEO')?.fileCount?.toLocaleString() ?? 0}`}
          sub="photos / videos"
          colour="bg-sky-600/20 text-sky-400"
        />
      </div>

      {/* ── Storage progress bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Storage capacity
          </h2>
          <span className={`text-lg font-bold ${
            overview.usedPct >= 90 ? 'text-red-400'
            : overview.usedPct >= 75 ? 'text-amber-400'
            : 'text-indigo-400'
          }`}>
            {overview.usedPct}%
          </span>
        </div>

        {/* Track */}
        <div className="relative h-4 rounded-full bg-slate-800 overflow-hidden">
          {/* Used */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
              overview.usedPct >= 90 ? 'bg-gradient-to-r from-red-600 to-rose-500'
              : overview.usedPct >= 75 ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
              : 'bg-gradient-to-r from-indigo-600 to-violet-500'
            }`}
            style={{ width: `${overview.usedPct}%` }}
          />
          {/* Trash sub-bar */}
          {overview.trashBytes > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-rose-500/50 transition-all duration-700"
              style={{ width: `${Math.min(100, (overview.trashBytes / overview.limitBytes) * 100)}%` }}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="text-slate-200 font-medium">{usedGB} GB</span> used
            <span className="mx-2 text-slate-700">·</span>
            <span className="text-rose-400 font-medium">{trashGB} GB</span> in trash
          </span>
          <span>{((overview.limitBytes - overview.totalBytes) / 1_073_741_824).toFixed(2)} GB free</span>
        </div>
      </div>

      {/* ── Upload activity + File type donut ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upload activity — monthly bar chart (takes 2/3) */}
        <Section title="Upload activity — last 13 months">
          <div className="col-span-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<UploadTooltip />} cursor={{ fill: 'rgba(99,102,241,0.1)' }} />
                <Bar dataKey="uploadCount" name="Uploads" fill={BAR_INDIGO} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* File type donut (takes 1/3) */}
        <Section title="File type split">
          <div className="h-56 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, name: string | undefined, props: any) =>
                    [`${(v as number).toLocaleString()} files (${fmtBytes(props.payload.bytes as number)})`, name ?? '']
                  }
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLOURS[i] }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* ── Status breakdown + Storage by year ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <Section title="Files by status">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusBars}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                barSize={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="status"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tickFormatter={s => STATUS_LABEL[s] ?? s}
                />
                <Tooltip
                  formatter={(v: any) => [v.toLocaleString() + ' files']}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(99,102,241,0.1)' }}
                />
                <Bar dataKey="fileCount" radius={[0, 4, 4, 0]}>
                  {statusBars.map(r => (
                    <Cell key={r.status} fill={STATUS_COLOUR[r.status] ?? '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Storage by year */}
        <Section title="Storage by year">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearBars} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtBytesShort}
                />
                <Tooltip
                  formatter={(v: any) => [fmtBytes(v), 'Storage']}
                  labelFormatter={l => `Year ${l}`}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(99,102,241,0.1)' }}
                />
                <Bar dataKey="totalBytes" fill={BAR_VIOLET} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* ── Storage by category ───────────────────────────────────────────── */}
      <Section title="Storage by event category">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catBars} margin={{ top: 4, right: 4, left: -8, bottom: 28 }} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtBytesShort}
              />
              <Tooltip
                formatter={(v: any) => [fmtBytes(v), 'Storage']}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: 12 }}
                itemStyle={{ color: '#e2e8f0' }}
                cursor={{ fill: 'rgba(99,102,241,0.1)' }}
              />
              <Bar dataKey="totalBytes" fill={BAR_INDIGO} radius={[4, 4, 0, 0]}>
                {catBars.map((_, i) => (
                  <Cell key={i} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ── Top uploaders ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Top uploaders by storage">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topUploaders}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                barSize={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtBytesShort}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                  tickFormatter={n => n.length > 12 ? n.slice(0, 11) + '…' : n}
                />
                <Tooltip
                  formatter={(v: any, name: string | undefined) => [
                    name === 'totalBytes' ? fmtBytes(v as number) : (v as number).toLocaleString() + ' files',
                    name === 'totalBytes' ? 'Storage' : 'Files',
                  ]}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(99,102,241,0.1)' }}
                />
                <Bar dataKey="totalBytes" fill={BAR_INDIGO} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table supplement */}
          <div className="mt-2 divide-y divide-slate-800">
            {topUploaders.slice(0, 5).map((u, i) => (
              <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-500 text-[10px]
                                   flex items-center justify-center font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-slate-300 font-medium truncate max-w-[140px]">{u.name}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-500 text-xs shrink-0">
                  <span>{u.fileCount.toLocaleString()} files</span>
                  <span className="text-slate-400 font-medium">{fmtBytes(u.totalBytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Most downloaded */}
        <Section title="Most downloaded files (top 10)">
          {mostDownloaded.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center">
              No downloads tracked yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-800">
              {mostDownloaded.map((f, i) => (
                <div key={f.id} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-500 text-[10px]
                                     flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    {f.fileType === 'VIDEO'
                      ? <Video className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      : <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 font-medium truncate">{f.originalName}</p>
                      <p className="text-[10px] text-slate-600 truncate">{f.eventName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-sky-400 font-semibold shrink-0">
                    <Download className="w-3.5 h-3.5" />
                    {f.downloadCount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Trash detail ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/10 p-5 flex items-center gap-4">
        <Trash2 className="w-8 h-8 text-rose-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-rose-300">
            Trash: {overview.trashFiles.toLocaleString()} file{overview.trashFiles !== 1 ? 's' : ''} — {trashGB} GB scheduled for purge
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Files in trash are automatically purged 30 days after deletion. Visit the{' '}
            <a href="/admin/trash" className="text-rose-400 hover:text-rose-300 underline transition">
              Trash page
            </a>{' '}
            to manage them.
          </p>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
