import { createHash } from 'crypto'
import { Transform }  from 'stream'

// ─────────────────────────────────────────────────────────────────────────────
// Buffer-based helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hex digest for an in-memory Buffer (server-side, Node.js).
 * The client-side counterpart uses `crypto.subtle.digest` (Web Crypto API) and
 * produces the same result for identical bytes.
 */
export function computeSHA256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming hash transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A passthrough Node.js Transform stream that incrementally computes a SHA-256
 * hash of every byte that flows through it.
 * After the stream emits 'finish', call `getDigest()` to retrieve the lowercase
 * hex string.
 */
export interface SHA256Transform extends Transform {
  getDigest(): string
}

export function createSHA256Transform(): SHA256Transform {
  const hash = createHash('sha256')
  let digest  = ''

  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      this.push(chunk)
      cb()
    },
    flush(cb) {
      // Set digest BEFORE calling cb so it is available when 'finish' fires.
      digest = hash.digest('hex')
      cb()
    },
  }) as SHA256Transform

  t.getDigest = () => digest
  return t
}
