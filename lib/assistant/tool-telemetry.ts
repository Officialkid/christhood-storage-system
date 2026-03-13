// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/tool-telemetry.ts
//
// In-memory telemetry for Zara's tool calls and action history.
// Ring-buffer approach — last N entries only, no DB writes.
// Survives across requests within a single server process (Node.js module cache).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 20

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCallEntry {
  id:            string
  timestamp:     string                    // ISO 8601
  toolName:      string
  args:          Record<string, unknown>
  resultSummary: string                    // "5 files returned" / "error: ..."
  userId:        string
  userName:      string
  responseMs:    number
  isError:       boolean
}

export interface ActionHistoryEntry {
  id:        string
  timestamp: string
  toolName:  string
  userId:    string
  userName:  string
  summary:   string
  outcome:   'confirmed' | 'cancelled' | 'expired'
}

export interface ToolPerfStats {
  toolName:   string
  callsToday: number
  totalCalls: number
  avgMs:      number
  errorRate:  number   // 0–100
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal ring buffers  (module-level singletons)
// ─────────────────────────────────────────────────────────────────────────────

const _callLog:       ToolCallEntry[]     = []
const _actionHistory: ActionHistoryEntry[] = []

interface PerfBucket {
  callsToday: number
  totalCalls: number
  totalMs:    number
  errors:     number
  todayDate:  string   // "YYYY-MM-DD" — reset key
}
const _perfMap = new Map<string, PerfBucket>()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function pushRing<T>(ring: T[], entry: T): void {
  ring.unshift(entry)
  if (ring.length > MAX_ENTRIES) ring.pop()
}

function genId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function updatePerf(toolName: string, responseMs: number, isError: boolean): void {
  const today    = todayKey()
  const existing = _perfMap.get(toolName)
  if (!existing || existing.todayDate !== today) {
    _perfMap.set(toolName, {
      callsToday: 1,
      totalCalls: existing ? existing.totalCalls + 1 : 1,
      totalMs:    (existing?.totalMs ?? 0) + responseMs,
      errors:     (existing?.errors  ?? 0) + (isError ? 1 : 0),
      todayDate:  today,
    })
  } else {
    existing.callsToday += 1
    existing.totalCalls += 1
    existing.totalMs    += responseMs
    if (isError) existing.errors += 1
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recorders   (called from route.ts and action-tools.ts)
// ─────────────────────────────────────────────────────────────────────────────

export function recordToolCall(entry: Omit<ToolCallEntry, 'id'>): void {
  pushRing(_callLog, { id: genId(), ...entry })
  updatePerf(entry.toolName, entry.responseMs, entry.isError)
}

export function recordActionExecuted(
  toolName: string,
  userId:   string,
  userName: string,
  summary:  string,
): void {
  pushRing(_actionHistory, {
    id:        genId(),
    timestamp: new Date().toISOString(),
    toolName,
    userId,
    userName,
    summary,
    outcome:   'confirmed',
  })
}

export function recordActionCancelled(
  toolName: string,
  userId:   string,
  userName: string,
  summary:  string,
): void {
  pushRing(_actionHistory, {
    id:        genId(),
    timestamp: new Date().toISOString(),
    toolName,
    userId,
    userName,
    summary,
    outcome:   'cancelled',
  })
}

export function recordActionExpired(
  toolName: string,
  userId:   string,
  summary:  string,
): void {
  pushRing(_actionHistory, {
    id:        genId(),
    timestamp: new Date().toISOString(),
    toolName,
    userId,
    userName:  'unknown',
    summary,
    outcome:   'expired',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters   (called from the admin API route)
// ─────────────────────────────────────────────────────────────────────────────

export function getToolCallLog(): ToolCallEntry[] {
  return [..._callLog]
}

export function getActionHistory(): ActionHistoryEntry[] {
  return [..._actionHistory]
}

export function getToolPerfStats(): ToolPerfStats[] {
  const today = todayKey()
  return Array.from(_perfMap.entries())
    .map(([toolName, s]) => ({
      toolName,
      callsToday: s.todayDate === today ? s.callsToday : 0,
      totalCalls: s.totalCalls,
      avgMs:      s.totalCalls > 0 ? Math.round(s.totalMs / s.totalCalls) : 0,
      errorRate:  s.totalCalls > 0 ? Math.round((s.errors / s.totalCalls) * 100) : 0,
    }))
    .sort((a, b) => b.callsToday - a.callsToday)
}
