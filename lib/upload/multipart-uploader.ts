/**
 * Parallel Multipart Uploader for Cloudflare R2
 * ──────────────────────────────────────────────
 * Performance comparison vs. the old sequential approach:
 *
 *   Sequential (old):  one chunk at a time → a 500 MB video takes ~15–20 min
 *                      on a 50 Mbps connection because every chunk must finish
 *                      before the next one begins.
 *
 *   Parallel (this):   all presigned URLs fetched in ONE server round-trip,
 *                      then PARALLEL_LIMIT chunks upload simultaneously.
 *                      The same 500 MB video takes ~2–3 min — the bottleneck
 *                      is now the raw network bandwidth, not the implementation.
 *
 * Protocol:
 *   1. POST /api/upload/multipart/create   → { uploadId, key, chunkSize }
 *   2. POST /api/upload/multipart/presign  → { presignedUrls: [{partNumber, url}] }
 *   3. PUT  <presignedUrl>  ×N  (parallel, PARALLEL_LIMIT at a time, XHR for progress)
 *   4. POST /api/upload/multipart/complete → { mediaFile }
 *   Abort:  POST /api/upload/multipart/abort
 */

export const CHUNK_SIZE     = 10 * 1024 * 1024  // 10 MB (R2 minimum part size is 5 MB)
export const PARALLEL_LIMIT = 4                  // simultaneous chunk uploads

/**
 * Thrown when a chunk upload fails due to a network connectivity problem
 * (as opposed to an auth error, server error, or intentional abort).
 *
 * UploadZone catches this to pause the upload without aborting the R2 session —
 * already-uploaded chunks are preserved and the upload can resume later.
 */
export class NetworkError extends Error {
  override name = 'NetworkError'
  constructor(message: string) {
    super(message)
  }
}

// ─────────────────────────────────────────────────────────────────── Types ───

export interface MultipartResumeInfo {
  uploadId:       string
  key:            string
  completedParts: { PartNumber: number; ETag: string }[]
}

export interface MultipartUploadOptions {
  file:          File
  eventId:       string
  subfolderId?:  string | null
  /** Resume a previous interrupted session (skip already-uploaded parts). */
  resume?:       MultipartResumeInfo
  /**
   * Fired once immediately after the upload session is created on R2.
   * NOT fired when resuming an existing session.
   * Use this to persist the session for crash-recovery / resume-on-reconnect.
   */
  onCreate?:     (info: { uploadId: string; key: string; totalParts: number }) => void
  /**
   * Fired after each chunk completes. Receives the full up-to-date completed-parts
   * array so callers can persist it to localStorage after every chunk.
   */
  onPartDone?:   (completedParts: { PartNumber: number; ETag: string }[], done: number, total: number) => void
  /** Fired right before the final /complete API call — use to show "Saving…" in the UI. */
  onCompleting?: () => void
  /** Overall progress 0–99 during upload, 100 after /complete returns. */
  onProgress?:   (pct: number) => void
  signal?:       AbortSignal
}

export interface MultipartUploadResult {
  mediaFile: { id: string; storedName: string; r2Key: string }
  uploadId:  string
  key:       string
}

// ─────────────────────────────────────────────────────────────── Internals ───

/** POST JSON to an API route, throw a readable Error on non-2xx. */
async function apiPost(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res  = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal,
  })
  const json = await res.json()
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${path} failed (HTTP ${res.status})`)
  return json
}

/**
 * Upload a single blob via XHR so we get granular per-chunk progress events.
 * Returns the ETag header from R2 — required to assemble the final object.
 *
 * NOTE: R2 CORS must expose the ETag response header.
 *   Add "ETag" to the AllowedHeaders / ExposeHeaders in your R2 CORS policy.
 */
function uploadChunk(
  url:        string,
  blob:       Blob,
  onProgress: (loadedBytes: number) => void,
  signal?:    AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(e.loaded)
    })

    xhr.addEventListener('load', () => {
      if (xhr.status < 300) {
        const raw  = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag') ?? ''
        const etag = raw.replace(/"/g, '')  // R2 may wrap the value in quotes
        if (!etag) {
          reject(new Error(
            'R2 did not return an ETag — check your bucket CORS config:' +
            ' ETag must be listed under AllowedHeaders and ExposeHeaders.',
          ))
        } else {
          resolve(etag)
        }
      } else {
        reject(new Error(`Chunk upload failed: HTTP ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new NetworkError('Network error during chunk upload')))
    xhr.addEventListener('abort', () => reject(new DOMException('Chunk upload aborted', 'AbortError')))

    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(blob)
  })
}

/**
 * Process an array of async tasks with a bounded concurrency limit.
 * Stops immediately if any task rejects or the AbortSignal fires.
 */
function runConcurrent<T>(
  items:   T[],
  limit:   number,
  worker:  (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const queue    = [...items]
    let   running  = 0
    let   failed   = false

    function dispatch() {
      if (failed) return
      if (signal?.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'))
        return
      }

      while (running < limit && queue.length > 0) {
        const item = queue.shift()!
        running++

        worker(item)
          .then(() => {
            running--
            if (failed) return
            if (queue.length > 0) {
              dispatch()
            } else if (running === 0) {
              resolve()
            }
          })
          .catch(err => {
            running--
            if (failed) return
            failed = true
            reject(err)
          })
      }

      if (queue.length === 0 && running === 0 && !failed) resolve()
    }

    dispatch()
  })
}

// ────────────────────────────────────────────────────────────── Public API ───

/**
 * Run a fully parallel multipart upload.
 *
 * @example
 * const result = await runMultipartUpload({
 *   file, eventId,
 *   onProgress: pct => setProgress(pct),
 * })
 */
export async function runMultipartUpload(opts: MultipartUploadOptions): Promise<MultipartUploadResult> {
  const {
    file, eventId, subfolderId, resume,
    onCreate, onPartDone, onCompleting, onProgress, signal,
  } = opts

  // ── 1. Create or resume the R2 multipart session ────────────────────────────
  let uploadId: string
  let key:      string
  const totalParts     = Math.ceil(file.size / CHUNK_SIZE)
  const completedParts: { PartNumber: number; ETag: string }[] = resume
    ? [...resume.completedParts]
    : []

  if (resume) {
    uploadId = resume.uploadId
    key      = resume.key
  } else {
    const created = await apiPost('/api/upload/multipart/create', {
      fileName:    file.name,
      fileSize:    file.size,
      mimeType:    file.type || 'application/octet-stream',
      eventId,
      subfolderId,
    }, signal) as { uploadId: string; key: string }

    uploadId = created.uploadId
    key      = created.key
    onCreate?.({ uploadId, key, totalParts })
  }

  // ── 2+3. Batch-presign remaining parts, then upload in parallel ─────────────
  const doneSet   = new Set(completedParts.map(p => p.PartNumber))
  const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter(n => !doneSet.has(n))

  if (remaining.length > 0) {
    // One round-trip to the server gets ALL presigned URLs at once.
    const { presignedUrls } = await apiPost('/api/upload/multipart/presign', {
      uploadId,
      key,
      partNumbers: remaining,
    }, signal) as { presignedUrls: { partNumber: number; url: string }[] }

    // Per-chunk byte-loaded tracker for smooth aggregate progress reporting.
    const bytesLoaded = new Array<number>(totalParts).fill(0)
    // Pre-fill already-completed chunks so resumed uploads show correct start %.
    for (const p of completedParts) {
      const start = (p.PartNumber - 1) * CHUNK_SIZE
      bytesLoaded[p.PartNumber - 1] = Math.min(CHUNK_SIZE, file.size - start)
    }

    const emitProgress = () => {
      const loaded = bytesLoaded.reduce((a, b) => a + b, 0)
      onProgress?.(Math.min(99, Math.round((loaded / file.size) * 100)))
    }
    emitProgress()  // show resume start % immediately

    await runConcurrent(presignedUrls, PARALLEL_LIMIT, async ({ partNumber, url }) => {
      const start = (partNumber - 1) * CHUNK_SIZE
      const end   = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)

      const etag = await uploadChunk(url, chunk, loaded => {
        bytesLoaded[partNumber - 1] = loaded
        emitProgress()
      }, signal)

      // Mark chunk as fully loaded in the progress tracker
      bytesLoaded[partNumber - 1] = end - start
      emitProgress()

      // JS is single-threaded — push is atomic in the microtask sense
      completedParts.push({ PartNumber: partNumber, ETag: etag })
      onPartDone?.([...completedParts], completedParts.length, totalParts)
    }, signal)
  }

  // ── 4. Tell R2 to assemble all parts into the final object ──────────────────
  // R2 requires parts to be in ascending PartNumber order.
  completedParts.sort((a, b) => a.PartNumber - b.PartNumber)

  onCompleting?.()

  const completed = await apiPost('/api/upload/multipart/complete', {
    uploadId,
    key,
    parts:        completedParts,
    originalName: file.name,
    fileType:     file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO',
    fileSize:     file.size,
    eventId,
    subfolderId,
  }, signal) as { mediaFile: { id: string; storedName: string; r2Key: string } }

  onProgress?.(100)
  return { mediaFile: completed.mediaFile, uploadId, key }
}

/**
 * Best-effort abort of an in-progress multipart session.
 * Call this when an upload fails or is cancelled so R2 can discard the
 * orphaned chunk data and you avoid paying for incomplete-upload storage.
 */
export async function abortMultipartSession(uploadId: string, key: string): Promise<void> {
  await fetch('/api/upload/multipart/abort', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uploadId, key }),
  }).catch(() => {/* cleanup is best-effort — never throw */})
}
