'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession }  from 'next-auth/react'
import { useRouter }   from 'next/navigation'
import {
  Bot, Activity, ShieldAlert, Users, Clock, AlertCircle,
  RefreshCw, CheckCircle2, XCircle, Loader2, Send, AlarmClock,
  BarChart3, FileText, Zap, Database, History, Ban, Timer, TrendingUp,
  Shield, RotateCcw, AlertTriangle,
} from 'lucide-react'
import { buildSystemPrompt } from '@/lib/assistant/system-prompt'
import type { ToolCallEntry, ActionHistoryEntry, ToolPerfStats } from '@/lib/assistant/tool-telemetry'
import type { PendingAction } from '@/lib/assistant/tools/action-tools'

// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring the /api/admin/assistant/stats response
// ─────────────────────────────────────────────────────────────────────────────
interface HealthData {
  status:     'ok' | 'error' | 'unknown'
  model?:     string
  message?:   string
  detail?:    string
  timestamp?: string
}

interface StatsData {
  date:            string
  totalRequests:   number
  errorCount:      number
  uniqueUsers:     number
  avgResponseMs:   number
  errorRatePct:    number
  rateLimitedHits: number
}

interface ErrorEntry {
  id:        string
  timestamp: string
  errorType: string
  userId:    string
  userName:  string
  message:   string
}

interface RateLimitUser {
  userId:    string
  userName:  string
  count:     number
  remaining: number
  resetsAt:  string
  isMaxed:   boolean
}

interface RateLimitData {
  totalTracked: number
  maxedOut:     number
  users:        RateLimitUser[]
}

interface StatsResponse {
  health:      HealthData
  stats:       StatsData
  errorLog:    ErrorEntry[]
  rateLimits:  RateLimitData
  serverTime:  string
}

interface ToolsResponse {
  toolCallLog:    ToolCallEntry[]
  pendingActions: PendingAction[]
  actionHistory:  ActionHistoryEntry[]
  perfStats:      ToolPerfStats[]
}

// ZaraActionLog entry (mirrors the Prisma model)
interface ZaraActionLogEntry {
  id:                     string
  actionType:             string
  riskLevel:              string
  requestedByUserId:      string
  requestedByName:        string
  confirmedAt:            string
  executedAt:             string | null
  completedAt:            string | null
  status:                 string
  inputArgs:              Record<string, unknown>
  preActionSnapshot:      Record<string, unknown> | null
  postActionResult:       Record<string, unknown> | null
  rollbackData:           Record<string, unknown> | null
  rollbackAvailableUntil: string | null
  notes:                  string | null
  createdAt:              string
  requestedBy:            { id: string; name: string | null; username: string | null }
}

type TestStatus = 'ok' | 'error'
interface EnhancedTestResult {
  gemini:   TestStatus
  database: TestStatus
  tools:    TestStatus
  detail: {
    geminiMessage?:   string
    geminiModel?:     string
    databaseMessage?: string
    userCount?:       number
    toolsMessage?:    string
    totalMs:          number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function minutesUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const m = Math.ceil(ms / 60_000)
  return `${m}m`
}

const ERROR_BADGE: Record<string, string> = {
  AUTH_ERROR:    'bg-red-900/50 text-red-300',
  RATE_LIMIT:    'bg-yellow-900/50 text-yellow-300',
  SAFETY_FILTER: 'bg-purple-900/50 text-purple-300',
  NETWORK_ERROR: 'bg-orange-900/50 text-orange-300',
  SERVER_ERROR:  'bg-red-900/50 text-red-300',
  BAD_REQUEST:   'bg-blue-900/50 text-blue-300',
  UNKNOWN:       'bg-slate-700 text-slate-300',
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminAssistantPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [data,         setData]         = useState<StatsResponse | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [lastRefresh,  setLastRefresh]  = useState<string>('')
  const [refreshing,   setRefreshing]   = useState(false)
  const [showPrompt,   setShowPrompt]   = useState(false)

  // Tool telemetry state
  const [toolData,     setToolData]     = useState<ToolsResponse | null>(null)
  const [toolLoading,  setToolLoading]  = useState(false)
  const [toolError,    setToolError]    = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // Enhanced connection test state
  const [testResult,   setTestResult]   = useState<EnhancedTestResult | null>(null)
  const [testRunning,  setTestRunning]  = useState(false)

  // Test message widget
  const [testMsg,      setTestMsg]      = useState('')
  const [testResponse, setTestResponse] = useState('')
  const [testDuration, setTestDuration] = useState<number | null>(null)
  const [testLoading,  setTestLoading]  = useState(false)
  const [testError,    setTestError]    = useState<string | null>(null)

  // Action log state
  const [actionLogData,    setActionLogData]    = useState<ZaraActionLogEntry[]>([])
  const [actionLogLoading, setActionLogLoading] = useState(false)
  const [rollbackTarget,   setRollbackTarget]   = useState<string | null>(null)
  const [rollbackInput,    setRollbackInput]    = useState('')
  const [rollbackLoading,  setRollbackLoading]  = useState(false)
  const [rollbackMsg,      setRollbackMsg]      = useState<{ id: string; ok: boolean; text: string } | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session?.user || session.user.role !== 'ADMIN') {
      router.replace('/dashboard')
    }
  }, [authStatus, session, router])

  // ── Data fetch ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/assistant/stats')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load stats')
      setData(json as StatsResponse)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  // ── Tool telemetry fetch ─────────────────────────────────────────────────
  const fetchToolData = useCallback(async () => {
    setToolLoading(true)
    setToolError(null)
    try {
      const res  = await fetch('/api/admin/assistant/tools')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load tool data')
      setToolData(json as ToolsResponse)
    } catch (e) {
      setToolError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setToolLoading(false)
    }
  }, [])

  // ── Cancel a pending action ───────────────────────────────────────────────
  const cancelPending = async (actionId: string) => {
    setCancellingId(actionId)
    try {
      const res = await fetch('/api/admin/assistant/tools', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'cancel', pendingActionId: actionId }),
      })
      if (res.ok) await fetchToolData()
    } finally {
      setCancellingId(null)
    }
  }

  // ── Action log fetch ─────────────────────────────────────────────────────
  const fetchActionLog = useCallback(async () => {
    setActionLogLoading(true)
    try {
      const res  = await fetch('/api/admin/assistant/action-log')
      const json = await res.json()
      if (res.ok) setActionLogData(json.logs ?? [])
    } catch { /* non-blocking */ }
    finally { setActionLogLoading(false) }
  }, [])

  // ── Rollback an action ────────────────────────────────────────────────────
  const executeRollback = async (logId: string) => {
    if (rollbackInput !== 'ROLLBACK') return
    setRollbackLoading(true)
    setRollbackMsg(null)
    try {
      const res  = await fetch(`/api/admin/assistant/action-log/${logId}/rollback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirmation: 'ROLLBACK' }),
      })
      const json = await res.json()
      setRollbackMsg({ id: logId, ok: res.ok, text: json.message ?? json.error ?? 'Done' })
      if (res.ok) {
        setRollbackTarget(null)
        setRollbackInput('')
        await fetchActionLog()
      }
    } finally {
      setRollbackLoading(false)
    }
  }

  // ── Enhanced connection test ──────────────────────────────────────────────
  const runEnhancedTest = async () => {
    setTestRunning(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/admin/assistant/tools/test')
      const json = await res.json()
      setTestResult(json as EnhancedTestResult)
    } catch {
      setTestResult({
        gemini: 'error', database: 'error', tools: 'error',
        detail: { geminiMessage: 'Request failed', totalMs: 0 },
      })
    } finally {
      setTestRunning(false)
    }
  }

  // Initial load + 30-second auto-refresh (stats + tool telemetry)
  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session?.user || session.user.role !== 'ADMIN') return

    fetchStats()
    fetchToolData()
    fetchActionLog()
    intervalRef.current = setInterval(() => {
      fetchStats()
      fetchToolData()
      fetchActionLog()
    }, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [authStatus, session, fetchStats, fetchToolData, fetchActionLog])

  // ── Test message send ───────────────────────────────────────────────────
  const sendTestMessage = async () => {
    if (!testMsg.trim() || testLoading) return
    setTestLoading(true)
    setTestResponse('')
    setTestDuration(null)
    setTestError(null)

    const start = Date.now()
    try {
      const res = await fetch('/api/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: testMsg.trim() }],
          context: {
            userName:    session?.user?.name  ?? 'Admin',
            userRole:    'ADMIN',
            currentPage: '/admin/assistant',
          },
        }),
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }

      // Consume SSE stream
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      let   full    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const parsed = JSON.parse(payload)
            if (parsed.token) full += parsed.token
            if (parsed.error) throw new Error(parsed.error)
          } catch { /* non-JSON line, skip */ }
        }
      }

      setTestResponse(full || '(empty response)')
      setTestDuration(Date.now() - start)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Test failed')
      setTestDuration(Date.now() - start)
    } finally {
      setTestLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (authStatus === 'loading' || (loading && !data)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  const previewPrompt = buildSystemPrompt({
    userName:    session?.user?.name ?? 'Admin Preview',
    userRole:    'ADMIN',
    currentPage: '/admin/assistant',
  })

  const health     = data?.health
  const stats      = data?.stats
  const errorLog   = data?.errorLog    ?? []
  const rateLimits = data?.rateLimits

  const healthColor =
    health?.status === 'ok'    ? 'text-emerald-400' :
    health?.status === 'error' ? 'text-red-400'     : 'text-slate-400'

  const healthBg =
    health?.status === 'ok'    ? 'bg-emerald-900/30 border-emerald-700/50' :
    health?.status === 'error' ? 'bg-red-900/30 border-red-700/50'         : 'bg-slate-800 border-slate-700'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bot className="w-7 h-7 text-indigo-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Assistant Debug Panel</h1>
            <p className="text-sm text-slate-400">Zara · Gemini 2.0 Flash</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-500">Last refresh: {lastRefresh}</span>
          )}
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Row 1: Connection status + Usage stats ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Connection Status */}
        <div className={`rounded-xl border p-5 space-y-4 ${healthBg}`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-400" />
            <h2 className="font-medium text-white text-sm">Connection Status</h2>
          </div>

          <div className="flex items-center gap-3">
            {health?.status === 'ok' ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : health?.status === 'error' ? (
              <XCircle className="w-8 h-8 text-red-400" />
            ) : (
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            )}
            <div>
              <p className={`text-lg font-semibold capitalize ${healthColor}`}>
                {health?.status ?? 'unknown'}
              </p>
              {health?.model && (
                <p className="text-xs text-slate-400">{health.model}</p>
              )}
              {health?.message && (
                <p className="text-xs text-red-400">{health.message}</p>
              )}
              {health?.detail && health.status === 'error' && (
                <p className="text-xs text-amber-400 mt-1">{health.detail}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>API Key</span>
              <span className={
                health?.status === 'error' && health.message?.toLowerCase().includes('key')
                  ? 'text-red-400' : 'text-emerald-400'
              }>
                {health?.status === 'error' && health.message?.toLowerCase().includes('key')
                  ? 'Not configured / Invalid' : 'Present'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Model</span>
              <span className="text-slate-300">{health?.model ?? '—'}</span>
            </div>
            {health?.timestamp && (
              <div className="flex justify-between">
                <span>Last check</span>
                <span className="text-slate-300">{fmtTime(health.timestamp)}</span>
              </div>
            )}
          </div>

          <button
            onClick={runEnhancedTest}
            disabled={testRunning}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testRunning ? 'Testing…' : 'Test Connection'}
          </button>

          {/* Enhanced test results */}
          {testResult && (
            <div className="space-y-2 pt-1">
              {(
                [
                  { key: 'gemini',   label: 'Gemini API',  msg: testResult.detail.geminiMessage,   extra: testResult.detail.geminiModel },
                  { key: 'database', label: 'Database',    msg: testResult.detail.databaseMessage, extra: testResult.detail.userCount !== undefined ? `${testResult.detail.userCount} users` : undefined },
                  { key: 'tools',    label: 'Tool Layer',  msg: testResult.detail.toolsMessage,    extra: undefined },
                ] as Array<{ key: 'gemini' | 'database' | 'tools'; label: string; msg: string | undefined; extra: string | undefined }>
              ).map(row => (
                <div key={row.key} className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {testResult[row.key] === 'ok'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    }
                    <span className="text-slate-300">{row.label}</span>
                    {row.extra && <span className="text-slate-500">· {row.extra}</span>}
                  </div>
                  {row.msg && (
                    <span className={`text-right ${testResult[row.key] === 'ok' ? 'text-slate-500' : 'text-red-400'}`}>
                      {row.msg}
                    </span>
                  )}
                </div>
              ))}
              <p className="text-xs text-slate-600 text-right">{testResult.detail.totalMs}ms total</p>
            </div>
          )}
        </div>

        {/* Usage Stats */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <h2 className="font-medium text-white text-sm">
              Usage Today
              {stats?.date && <span className="text-slate-500 font-normal ml-1">({stats.date})</span>}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{stats?.totalRequests ?? 0}</p>
              <p className="text-xs text-slate-400 mt-0.5">Messages</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{stats?.uniqueUsers ?? 0}</p>
              <p className="text-xs text-slate-400 mt-0.5">Unique Users</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {stats?.avgResponseMs ? `${stats.avgResponseMs}ms` : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Avg Response</p>
            </div>
            <div className={`bg-slate-900/60 rounded-lg p-3 text-center ${
              (stats?.errorRatePct ?? 0) > 20 ? 'ring-1 ring-red-500/50' : ''
            }`}>
              <p className={`text-2xl font-bold ${
                (stats?.errorRatePct ?? 0) > 20 ? 'text-red-400' : 'text-white'
              }`}>
                {stats?.errorRatePct ?? 0}%
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Error Rate</p>
            </div>
          </div>

          {(stats?.rateLimitedHits ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2">
              <AlarmClock className="w-3.5 h-3.5" />
              {stats!.rateLimitedHits} request{stats!.rateLimitedHits > 1 ? 's' : ''} hit the rate limit today
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Recent errors + Rate limits ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Errors */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <h2 className="font-medium text-white text-sm">Recent Errors</h2>
            {errorLog.length > 0 && (
              <span className="ml-auto text-xs text-slate-500">Last 10</span>
            )}
          </div>

          {errorLog.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
              No errors recorded yet
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {errorLog.map(entry => (
                <div key={entry.id} className="bg-slate-900/60 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ERROR_BADGE[entry.errorType] ?? ERROR_BADGE.UNKNOWN}`}>
                      {entry.errorType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-500">{fmtDateTime(entry.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-300">{entry.message}</p>
                  <p className="text-xs text-slate-500">{entry.userName} ({entry.userId.slice(0, 8)}…)</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rate Limit Status */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="font-medium text-white text-sm">Rate Limit Status</h2>
            {rateLimits && (
              <span className="ml-auto text-xs text-slate-500">
                {rateLimits.totalTracked} active • {rateLimits.maxedOut} maxed out
              </span>
            )}
          </div>

          {!rateLimits || rateLimits.users.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Activity className="w-6 h-6 mx-auto mb-2 text-slate-600" />
              No active rate limit entries
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {rateLimits.users.map(u => (
                <div key={u.userId} className={`rounded-lg p-3 space-y-1.5 ${
                  u.isMaxed ? 'bg-red-900/20 border border-red-700/40' : 'bg-slate-900/60'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium truncate">{u.userName}</span>
                    {u.isMaxed && (
                      <span className="text-xs text-red-400 bg-red-900/40 px-2 py-0.5 rounded-full flex-shrink-0">
                        Maxed out
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{u.count} / 30 used</span>
                    <span>{u.remaining} remaining</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Resets in {minutesUntil(u.resetsAt)}
                    </span>
                  </div>
                  {/* Usage bar */}
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${u.isMaxed ? 'bg-red-500' : 'bg-indigo-500'}`}
                      style={{ width: `${Math.min(100, (u.count / 30) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── System Prompt Preview ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <button
          onClick={() => setShowPrompt(p => !p)}
          className="flex items-center gap-2 w-full text-left"
        >
          <FileText className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">System Prompt Preview</h2>
          <span className="ml-auto text-xs text-slate-500">{showPrompt ? 'Collapse ▲' : 'Expand ▼'}</span>
        </button>

        {showPrompt && (
          <pre className="bg-slate-900/80 rounded-lg p-4 text-xs text-slate-300 overflow-auto max-h-96 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {previewPrompt}
          </pre>
        )}
      </div>

      {/* ── Send Test Message ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">Send Test Message</h2>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={testMsg}
            onChange={e => setTestMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendTestMessage()}
            placeholder="Ask Zara something…"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={testLoading}
          />
          <button
            onClick={sendTestMessage}
            disabled={testLoading || !testMsg.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {testLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
              : <><Send className="w-3.5 h-3.5" /> Send</>
            }
          </button>
        </div>

        {testError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {testError}
          </div>
        )}

        {testResponse && (
          <div className="space-y-2">
            <div className="bg-slate-900/60 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
              {testResponse}
            </div>
            {testDuration !== null && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Response time: {testDuration}ms
              </p>
            )}
          </div>
        )}
      </div>

      {toolError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Tool data: {toolError}
        </div>
      )}

      {/* ── Tool Call Log ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">Tool Call Log</h2>
          <span className="ml-auto text-xs text-slate-500">
            {toolLoading
              ? <Loader2 className="w-3 h-3 animate-spin inline" />
              : `Last ${toolData?.toolCallLog.length ?? 0} calls`
            }
          </span>
        </div>

        {!toolData?.toolCallLog.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <Database className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            No tool calls recorded yet. Ask Zara something that requires a database lookup.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {toolData.toolCallLog.map(entry => (
              <div key={entry.id} className={`rounded-lg p-3 space-y-2 ${
                entry.isError ? 'bg-red-900/20 border border-red-800/40' : 'bg-slate-900/60'
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-indigo-300">{entry.toolName}</span>
                    {entry.isError && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">error</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{entry.responseMs}ms</span>
                    <span>{fmtDateTime(entry.timestamp)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">{entry.resultSummary}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>by {entry.userName}</span>
                  {Object.keys(entry.args).length > 0 && (
                    <details className="text-right">
                      <summary className="cursor-pointer text-slate-600 hover:text-slate-400">args</summary>
                      <pre className="mt-1 text-left text-[10px] text-slate-400 bg-black/30 rounded p-2 max-w-xs overflow-auto">
                        {JSON.stringify(entry.args, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pending Actions Monitor ───────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">Pending Actions</h2>
          <span className="ml-auto text-xs text-slate-500">
            {toolData?.pendingActions.length
              ? <span className="text-yellow-400">{toolData.pendingActions.length} awaiting confirmation</span>
              : 'None pending'
            }
          </span>
        </div>

        {!toolData?.pendingActions.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            No actions currently awaiting confirmation.
          </div>
        ) : (
          <div className="space-y-2">
            {toolData.pendingActions.map(action => (
              <div key={action.id} className="rounded-lg bg-yellow-900/20 border border-yellow-700/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-medium text-yellow-300">{action.toolName}</span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    expires {minutesUntil(action.expiresAt.toString())}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Requested by user <span className="text-slate-300 font-mono">{action.userId.slice(0, 8)}…</span>
                </p>
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300">View parameters</summary>
                  <pre className="mt-1 text-[10px] text-slate-400 bg-black/30 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(action.args, null, 2)}
                  </pre>
                </details>
                <button
                  onClick={() => cancelPending(action.id)}
                  disabled={cancellingId === action.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-red-900/40 border border-red-700/40 text-red-400 hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                >
                  {cancellingId === action.id
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Cancelling…</>
                    : <><Ban className="w-3 h-3" />Cancel Action</>
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Action History ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">Action History</h2>
          <span className="ml-auto text-xs text-slate-500">Last {toolData?.actionHistory.length ?? 0}</span>
        </div>

        {!toolData?.actionHistory.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <History className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            No actions have been executed through Zara yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {toolData.actionHistory.map(entry => (
              <div key={entry.id} className="bg-slate-900/60 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-mono font-medium text-indigo-300">{entry.toolName}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      entry.outcome === 'confirmed' ? 'bg-emerald-900/50 text-emerald-400' :
                      entry.outcome === 'cancelled' ? 'bg-slate-700 text-slate-400'         :
                                                      'bg-orange-900/50 text-orange-400'
                    }`}>
                      {entry.outcome}
                    </span>
                    <span className="text-xs text-slate-500">{fmtDateTime(entry.timestamp)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{entry.summary}</p>
                <p className="text-xs text-slate-500">by {entry.userName}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tool Performance Stats ────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white text-sm">Tool Performance</h2>
          <span className="ml-auto text-xs text-slate-500">
            {toolData?.perfStats.length ? `${toolData.perfStats.length} tools tracked` : 'No data yet'}
          </span>
        </div>

        {!toolData?.perfStats.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <BarChart3 className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            Tool performance data will appear after Zara makes her first tool calls.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-4 font-medium">Tool</th>
                  <th className="text-right py-2 px-3 font-medium">Today</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                  <th className="text-right py-2 px-3 font-medium">Avg ms</th>
                  <th className="text-right py-2 pl-3 font-medium">Error%</th>
                </tr>
              </thead>
              <tbody>
                {toolData.perfStats.map(stat => (
                  <tr key={stat.toolName} className="border-b border-slate-800 hover:bg-slate-900/40">
                    <td className="py-2 pr-4 font-mono text-indigo-300">{stat.toolName}</td>
                    <td className="py-2 px-3 text-right">{stat.callsToday}</td>
                    <td className="py-2 px-3 text-right text-slate-500">{stat.totalCalls}</td>
                    <td className={`py-2 px-3 text-right ${stat.avgMs > 2000 ? 'text-yellow-400' : ''}`}>
                      {stat.avgMs}
                    </td>
                    <td className={`py-2 pl-3 text-right ${stat.errorRate > 20 ? 'text-red-400' : 'text-slate-400'}`}>
                      {stat.errorRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Zara Action Log (DB-persisted) ────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          <h2 className="font-medium text-white text-sm">Zara Action Log</h2>
          <span className="text-xs text-slate-500 ml-2">DB-persisted — last 50</span>
          {actionLogLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-auto" />}
          {!actionLogLoading && (
            <button
              onClick={fetchActionLog}
              className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          )}
        </div>

        {actionLogData.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <Shield className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            No confirmed actions recorded yet. Executed actions will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-3 font-medium">Action</th>
                  <th className="text-left py-2 px-3 font-medium">Risk</th>
                  <th className="text-left py-2 px-3 font-medium">By</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                  <th className="text-right py-2 pl-3 font-medium">Rollback</th>
                </tr>
              </thead>
              <tbody>
                {actionLogData.map(entry => {
                  const canRollback =
                    entry.status === 'EXECUTED' &&
                    entry.rollbackData !== null &&
                    (entry.rollbackAvailableUntil === null || new Date(entry.rollbackAvailableUntil) > new Date())

                  const riskColor =
                    entry.riskLevel === 'SAFE'      ? 'bg-green-900/40 text-green-300'   :
                    entry.riskLevel === 'MODERATE'  ? 'bg-blue-900/40 text-blue-300'     :
                    entry.riskLevel === 'SENSITIVE' ? 'bg-amber-900/40 text-amber-300'   :
                    entry.riskLevel === 'HIGH'      ? 'bg-orange-900/40 text-orange-300' :
                                                     'bg-red-900/40 text-red-300'

                  const statusColor =
                    entry.status === 'EXECUTED'    ? 'text-emerald-400' :
                    entry.status === 'FAILED'      ? 'text-red-400'     :
                    entry.status === 'ROLLED_BACK' ? 'text-purple-400'  :
                    entry.status === 'EXECUTING'   ? 'text-yellow-400'  :
                                                    'text-slate-400'

                  return (
                    <tr key={entry.id} className="border-b border-slate-800 hover:bg-slate-900/40">
                      <td className="py-2 pr-3 font-mono text-indigo-300 max-w-[160px] truncate">
                        {entry.actionType}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${riskColor}`}>
                          {entry.riskLevel}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 truncate max-w-[100px]">
                        {entry.requestedByName}
                      </td>
                      <td className={`py-2 px-3 font-medium ${statusColor}`}>
                        {entry.status}
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {fmtDateTime(entry.confirmedAt)}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {canRollback && rollbackTarget !== entry.id && (
                          <button
                            onClick={() => { setRollbackTarget(entry.id); setRollbackInput(''); setRollbackMsg(null) }}
                            className="flex items-center gap-1 ml-auto text-[11px] px-2 py-1 rounded bg-orange-900/40 text-orange-300 hover:bg-orange-900/60 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" /> Rollback
                          </button>
                        )}

                        {/* Inline rollback confirmation */}
                        {rollbackTarget === entry.id && (
                          <div className="flex flex-col gap-1.5 items-end">
                            <p className="text-[10px] text-orange-300 font-semibold">
                              Type <strong>ROLLBACK</strong> to confirm:
                            </p>
                            <input
                              type="text"
                              value={rollbackInput}
                              onChange={e => setRollbackInput(e.target.value.toUpperCase())}
                              placeholder="ROLLBACK"
                              className="w-28 text-xs px-2 py-1 rounded border border-orange-500/50 bg-slate-900 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                            {rollbackMsg?.id === entry.id && (
                              <p className={`text-[10px] ${rollbackMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                {rollbackMsg.text}
                              </p>
                            )}
                            <div className="flex gap-1">
                              <button
                                onClick={() => executeRollback(entry.id)}
                                disabled={rollbackInput !== 'ROLLBACK' || rollbackLoading}
                                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {rollbackLoading
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <RotateCcw className="w-3 h-3" />
                                }
                                Execute
                              </button>
                              <button
                                onClick={() => { setRollbackTarget(null); setRollbackInput(''); setRollbackMsg(null) }}
                                className="text-[11px] px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {entry.status === 'ROLLED_BACK' && (
                          <span className="text-[10px] text-purple-400 italic">rolled back</span>
                        )}
                        {entry.status === 'EXECUTED' && !canRollback && entry.rollbackData !== null && (
                          <span className="text-[10px] text-slate-600 italic">window expired</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
