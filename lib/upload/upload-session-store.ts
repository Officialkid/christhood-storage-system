/**
 * lib/upload/upload-session-store.ts
 *
 * IndexedDB-backed store for multipart upload sessions.
 *
 * Why IndexedDB instead of localStorage?
 *   – Survives page reloads, browser restarts, and PWA wake-ups.
 *   – Works in private-browsing mode where localStorage may be restricted.
 *   – Async — never blocks the main thread.
 *   – R2 keeps uploaded chunk data alive for 7 days, so we only need to
 *     persist the lightweight session metadata (not the file bytes).
 *
 * DB:    cmms_upload_sessions  (v1)
 * Store: sessions  (keyPath: sessionId)
 */

const DB_NAME    = 'cmms_upload_sessions'
const DB_VERSION = 1
const STORE      = 'sessions'

// ─────────────────────────────────────────────────────────────────── Types ───

export interface UploadSession {
  /**
   * Stable file fingerprint used as the IDB key.
   * `${encodeURIComponent(fileName)}_${fileSize}_${lastModified}`
   * Two File objects with identical name+size+lastModified will produce the
   * same fingerprint — critical for resuming after page reload.
   */
  sessionId:      string

  uploadId:       string   // R2 multipart upload session ID
  key:            string   // R2 object key (storage path)

  fileName:       string
  fileSize:       number
  mimeType:       string

  eventId:        string
  subfolderId?:   string | null

  totalChunks:    number
  chunkSize:      number

  /**
   * Parts that have already been uploaded to R2.
   * PascalCase matches the AWS/R2 API format so we can pass this directly
   * to the complete-multipart-upload call without any transformation.
   */
  completedParts: { PartNumber: number; ETag: string }[]
  failedChunks:   number[]

  status:         'active' | 'paused'

  startedAt:      string   // ISO timestamp
  lastProgressAt: string   // ISO timestamp
}

// ─────────────────────────────────────────────────────────────── DB helpers ───

let _db: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' })
      }
    }

    req.onsuccess = e => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    req.onerror = () => reject(req.error)
  })
}

function idbOp<T>(
  fn:   (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode = 'readonly',
): Promise<T> {
  return openDB().then(
    db => new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => reject(req.error)
    }),
  )
}

// ─────────────────────────────────────────────────────────────── Public API ───

/**
 * Generate the stable session ID for a File.
 * Two File objects representing the same file (same name + size + lastModified)
 * will always produce the same ID — required for cross-session resume.
 */
export function sessionIdFor(file: File): string {
  return `${encodeURIComponent(file.name)}_${file.size}_${file.lastModified}`
}

/** Persist (create or overwrite) a session record. */
export async function saveSession(session: UploadSession): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await idbOp<any>(s => s.put(session), 'readwrite')
}

/** Load a session by its stable file fingerprint. Returns `undefined` if not found. */
export function getSession(sessionId: string): Promise<UploadSession | undefined> {
  return idbOp<UploadSession | undefined>(s => s.get(sessionId))
}

/**
 * Merge a partial update into an existing session.
 * Automatically updates `lastProgressAt` to now.
 * No-ops silently if the session is not found.
 */
export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<UploadSession, 'completedParts' | 'failedChunks' | 'status' | 'lastProgressAt'>>,
): Promise<void> {
  const existing = await getSession(sessionId)
  if (!existing) return
  await saveSession({
    ...existing,
    ...patch,
    lastProgressAt: new Date().toISOString(),
  })
}

/** Delete a session. Call after a successful upload completes. */
export async function deleteSession(sessionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await idbOp<any>(s => s.delete(sessionId), 'readwrite')
}

/**
 * Fuzzy-find an active/paused session by fileName + fileSize only — no lastModified.
 *
 * On Android Chrome the File object's lastModified value is sometimes set to
 * "now" rather than the file's actual mtime, so sessionIdFor(file) can return a
 * different key each time the same file is picked. Use this as a fallback when
 * getSession(sessionIdFor(file)) returns nothing.
 */
export async function getSessionByFileName(
  fileName: string,
  fileSize:  number,
): Promise<UploadSession | undefined> {
  const all = await idbOp<UploadSession[]>(s => s.getAll())
  return all.find(
    s => s.fileName === fileName &&
         s.fileSize  === fileSize &&
         (s.status === 'active' || s.status === 'paused'),
  )
}

/**
 * Return all sessions that have not yet completed.
 * Called on page load to detect interrupted uploads from previous sessions.
 */
export async function getActiveSessions(): Promise<UploadSession[]> {
  const all = await idbOp<UploadSession[]>(s => s.getAll())
  return all.filter(s => s.status === 'active' || s.status === 'paused')
}

/**
 * Discard (delete) all stored sessions.
 * Called when the user clicks "Discard all" in the resume banner.
 */
export async function discardAllSessions(): Promise<void> {
  const sessions = await getActiveSessions()
  await Promise.allSettled(sessions.map(s => deleteSession(s.sessionId)))
}
