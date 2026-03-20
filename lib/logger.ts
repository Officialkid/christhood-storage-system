/**
 * lib/logger.ts
 *
 * Structured stdout logger for Cloud Run / Google Cloud Logging.
 *
 * Cloud Run captures every line written to stdout as a structured log entry.
 * When the line is valid JSON with a "severity" key, Cloud Logging parses
 * every field automatically — making them individually filterable and
 * searchable in the Logs Explorer without any extra setup.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *
 *   logger.info('FILE_UPLOADED', { userId, route: '/api/upload/register', fileId, duration, message: '...' })
 *   logger.error('FILE_UPLOAD_FAILED', { userId, route, error: err.message, errorCode: err.code, message: '...' })
 *
 * IMPORTANT: This logger writes to stdout only. It is completely separate from
 * the ActivityLog Prisma table (lib/activityLog.ts), which records audit events
 * to the database. Both systems should be used together in critical routes.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  level:        LogLevel
  event:        string                       // machine-readable event name: "FILE_UPLOAD_FAILED"
  message:      string                       // human-readable description
  userId?:      string                       // who triggered this (NEVER log passwords or tokens)
  userRole?:    string
  route?:       string                       // which API route: "/api/upload"
  duration?:    number                       // operation time in ms
  fileId?:      string                       // relevant entity IDs
  eventId?:     string
  transferId?:  string
  error?:       string                       // error message if applicable
  errorCode?:   string                       // Prisma error codes, HTTP status codes, etc.
  metadata?:    Record<string, unknown>      // any extra context
}

/**
 * Write a single structured log line to stdout.
 * Cloud Run → Google Cloud Logging parses JSON with "severity" automatically.
 */
export function log(entry: LogEntry): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    severity:  entry.level.toUpperCase(),    // GCL field: INFO | WARN | ERROR | DEBUG
    timestamp: new Date().toISOString(),
    ...entry,
  }))
}

/**
 * Convenience helpers — call these instead of console.log / console.error.
 *
 * Pattern:
 *   logger.info('EVENT_NAME', { userId, route, message, ...other fields })
 *   logger.error('EVENT_FAILED', { userId, route, error: err.message, message })
 */
export const logger = {
  info: (event: string, data: Omit<LogEntry, 'level' | 'event'>): void =>
    log({ level: 'info',  event, ...data }),

  warn: (event: string, data: Omit<LogEntry, 'level' | 'event'>): void =>
    log({ level: 'warn',  event, ...data }),

  error: (event: string, data: Omit<LogEntry, 'level' | 'event'>): void =>
    log({ level: 'error', event, ...data }),

  debug: (event: string, data: Omit<LogEntry, 'level' | 'event'>): void =>
    log({ level: 'debug', event, ...data }),
}
