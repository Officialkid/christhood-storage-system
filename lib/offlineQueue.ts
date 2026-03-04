/**
 * lib/offlineQueue.ts
 *
 * IndexedDB-backed offline upload queue.
 * When the device is offline during an upload attempt the file + metadata is
 * stored here.  When the device reconnects the UploadZone drains the queue
 * automatically.
 *
 * Storage schema
 *   DB:    cmms_offline_uploads  (v1)
 *   Store: uploads
 *   Key:   uid  (string, auto-generated)
 *   Value: QueuedUpload
 */

const DB_NAME    = 'cmms_offline_uploads'
const DB_VERSION = 1
const STORE      = 'uploads'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueuedUpload {
  /** Unique ID for the queued item – also used as IndexedDB key */
  uid:          string
  /** The raw file data stored as a Blob (IndexedDB supports Blob natively) */
  blob:         Blob
  originalName: string
  contentType:  string
  fileSize:     number
  eventId:      string
  subfolderId?: string | null
  /** ISO timestamp when this item was queued */
  addedAt:      string
}

// ── DB helpers ────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'uid' })
      }
    }

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    req.onerror = () => reject(req.error)
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add a file to the offline queue.
 * Called when an upload is attempted while the device is offline.
 */
export async function queueUpload(item: QueuedUpload): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx   = db.transaction(STORE, 'readwrite')
    const req  = tx.objectStore(STORE).put(item)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Return all pending offline uploads ordered by addedAt (oldest first).
 */
export async function getQueue(): Promise<QueuedUpload[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx   = db.transaction(STORE, 'readonly')
    const req  = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const items = (req.result as QueuedUpload[]).sort(
        (a, b) => a.addedAt.localeCompare(b.addedAt),
      )
      resolve(items)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Remove a successfully uploaded item from the queue.
 */
export async function removeFromQueue(uid: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(uid)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Wipe the entire queue.
 */
export async function clearQueue(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).clear()
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Return the number of queued items without loading their blobs.
 */
export async function queueCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}
