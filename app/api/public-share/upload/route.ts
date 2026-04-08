/**
 * POST /api/public-share/upload
 *
 * Public (no-auth) file upload — server-side proxy to R2.
 * The client sends multipart/form-data; this route validates, uploads the
 * file directly to R2 from the server, and returns the share token.
 * Bypasses browser CORS restrictions on direct R2 PUT requests.
 *
 * ISOLATION: No authentication required. Zero coupling to CMMS user accounts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hash }                       from 'bcryptjs'
import { prisma }                     from '@/lib/prisma'
import { putObject }                  from '@/lib/r2'
import { checkPublicShareRateLimit }  from '@/lib/rate-limit'

// Allow up to 60 s for large file uploads on Cloud Run
export const maxDuration = 60

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024          // 50 MB
const EXPIRY_DAYS         = 7
const BCRYPT_ROUNDS       = 10

/** Blocklist of executable MIME types that must never be stored or served. */
const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/x-com',
  'application/x-dex',
  'application/x-elf',
]

function isBlockedMime(mime: string): boolean {
  if (!mime) return false
  return BLOCKED_MIME_TYPES.includes(mime.toLowerCase())
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

  // ── Parse multipart form data ─────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const fileBlob      = formData.get('file')
  const filename      = formData.get('filename')
  const fileSizeRaw   = formData.get('fileSize')
  const mimeType      = formData.get('mimeType')
  const title         = formData.get('title')
  const message       = formData.get('message')
  const pin           = formData.get('pin')
  const recipientEmail = formData.get('recipientEmail')

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!(fileBlob instanceof Blob)) {
    return NextResponse.json({ error: 'file is required.' }, { status: 400 })
  }
  if (typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'filename is required.' }, { status: 400 })
  }
  const fileSize = Number(fileSizeRaw)
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File must be between 1 byte and ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` },
      { status: 400 },
    )
  }
  if (typeof mimeType !== 'string') {
    return NextResponse.json({ error: 'mimeType is required.' }, { status: 400 })
  }
  if (isBlockedMime(mimeType)) {
    return NextResponse.json({ error: 'Executable file types are not allowed.' }, { status: 400 })
  }

  // Validate optional fields
  const sanitizedTitle   = typeof title   === 'string' ? title.trim().slice(0, 200)    : null
  const sanitizedMessage = typeof message === 'string' ? message.trim().slice(0, 1000) : null
  const sanitizedEmail   = typeof recipientEmail === 'string' && recipientEmail.trim()
    ? recipientEmail.trim().toLowerCase().slice(0, 320)
    : null
  if (sanitizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    return NextResponse.json({ error: 'Invalid recipient email address.' }, { status: 400 })
  }

  // PIN validation: must be 4–8 digits if provided
  let pinHash: string | null = null
  if (pin && typeof pin === 'string' && pin !== '') {
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
    }
    pinHash = await hash(pin, BCRYPT_ROUNDS)
  }

  // ── Build R2 key + token ──────────────────────────────────────────────────
  const token    = crypto.randomUUID()
  const safeName = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_').replace(/\.\./g, '_')
  const r2Key    = `public-shares/${token}/${safeName}`
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // ── Upload to R2 server-side (no CORS required) ───────────────────────────
  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer())
  await putObject(r2Key, fileBuffer, mimeType || 'application/octet-stream')

  // ── Create DB record (isReady = true — file is already in R2) ────────────
  await prisma.publicShareUpload.create({
    data: {
      token,
      r2Key,
      originalName:   filename.slice(0, 500),
      fileSize:       BigInt(Math.floor(fileSize)),
      mimeType:       (mimeType ?? 'application/octet-stream').slice(0, 200),
      title:          sanitizedTitle,
      message:        sanitizedMessage,
      recipientEmail: sanitizedEmail,
      pinHash,
      expiresAt,
      uploaderIp:     ip,
      isReady:        true,
    },
  })

  return NextResponse.json({ token, expiresAt }, { status: 201 })
}
