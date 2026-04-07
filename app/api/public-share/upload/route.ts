/**
 * POST /api/public-share/upload
 *
 * Initiates a public (no-auth) file upload:
 *  1. Rate-limits the uploader IP (5 uploads / 60 min via Upstash)
 *  2. Validates filename, file size (≤50 MB), and MIME type
 *  3. Optionally hashes a PIN with bcryptjs
 *  4. Creates a PublicShareUpload record (isReady = false)
 *  5. Returns a presigned R2 PUT URL + the share token
 *
 * The client uploads the file directly to R2 via the presigned URL, then
 * calls POST /api/public-share/[token]/confirm to mark isReady = true.
 *
 * ISOLATION: No authentication required. Zero coupling to CMMS user accounts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hash }                       from 'bcryptjs'
import { prisma }                     from '@/lib/prisma'
import { getPresignedUploadUrl }      from '@/lib/r2'
import { checkPublicShareRateLimit }  from '@/lib/rate-limit'

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024          // 50 MB
const EXPIRY_DAYS         = 7
const BCRYPT_ROUNDS       = 10

/** Broad allowlist of MIME type prefixes. Reject executables and archives. */
const ALLOWED_MIME_PREFIXES = [
  'image/', 'video/', 'audio/', 'text/', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-',
  'application/zip',
  'application/x-zip-compressed',
]

function isAllowedMime(mime: string): boolean {
  if (!mime) return false
  return ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))
}

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

export async function POST(req: NextRequest) {
  const ip = extractIp(req)

  // ── Rate limit check ──────────────────────────────────────────────────────
  const rl = await checkPublicShareRateLimit(ip)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: {
    filename?: unknown
    fileSize?: unknown
    mimeType?: unknown
    title?: unknown
    message?: unknown
    pin?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { filename, fileSize, mimeType, title, message, pin } = body

  if (typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'filename is required.' }, { status: 400 })
  }
  if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `fileSize must be between 1 byte and ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` },
      { status: 400 },
    )
  }
  if (typeof mimeType !== 'string' || !isAllowedMime(mimeType)) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 })
  }

  // Validate optional fields
  const sanitizedTitle   = typeof title   === 'string' ? title.trim().slice(0, 200)  : null
  const sanitizedMessage = typeof message === 'string' ? message.trim().slice(0, 1000) : null

  // PIN validation: must be 4–8 digits if provided
  let pinHash: string | null = null
  if (pin !== undefined && pin !== null && pin !== '') {
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be 4–8 digits.' },
        { status: 400 },
      )
    }
    pinHash = await hash(pin, BCRYPT_ROUNDS)
  }

  // ── Build R2 key + token ──────────────────────────────────────────────────
  const token       = crypto.randomUUID()
  // Sanitize filename: strip path traversal, keep only safe characters
  const safeName    = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_').replace(/\.\./g, '_')
  const r2Key       = `public-shares/${token}/${safeName}`
  const expiresAt   = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // ── Create DB record (isReady = false until client confirms R2 upload) ────
  await prisma.publicShareUpload.create({
    data: {
      token,
      r2Key,
      originalName:  filename.slice(0, 500),
      fileSize:      BigInt(Math.floor(fileSize)),
      mimeType:      mimeType.slice(0, 200),
      title:         sanitizedTitle,
      message:       sanitizedMessage,
      pinHash,
      expiresAt,
      uploaderIp:    ip,
    },
  })

  // ── Generate presigned R2 PUT URL ─────────────────────────────────────────
  // Expires in 15 minutes — enough time for the client to complete the upload
  const uploadUrl = await getPresignedUploadUrl(r2Key, mimeType, 15 * 60)

  return NextResponse.json({ token, uploadUrl, expiresAt }, { status: 201 })
}
