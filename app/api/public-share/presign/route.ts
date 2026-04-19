/**
 * POST /api/public-share/presign
 *
 * Creates a pending DB record and returns a presigned R2 PUT URL.
 * The browser uploads the file DIRECTLY to R2 (no data passes through the
 * Next.js server), eliminating the 32 MB Cloud Run body-size limit (413).
 *
 * Flow:
 *   1. Browser  → POST /api/public-share/presign   (tiny JSON, < 1 KB)
 *   2. Browser  → PUT  <presignedUrl>              (raw file → R2)
 *   3. Browser  → POST /api/public-share/[token]/confirm
 *
 * The record starts with isReady = false and is confirmed in step 3.
 * A cron job purges unconfirmed records older than 2 hours.
 *
 * ISOLATION: No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hash }                       from 'bcryptjs'
import { prisma }                     from '@/lib/prisma'
import { getPresignedUploadUrl }       from '@/lib/r2'
import { checkPublicShareRateLimit }   from '@/lib/rate-limit'

export const maxDuration = 30

const EXPIRY_DAYS   = 7
const BCRYPT_ROUNDS = 10

const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-bat',
  'application/x-com',
  'application/x-dex',
  'application/x-elf',
])

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

export async function POST(req: NextRequest) {
  const ip = extractIp(req)

  const rl = await checkPublicShareRateLimit(ip)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { filename, mimeType, fileSize, title, message, recipientEmail, pin } = body

  if (typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'filename is required.' }, { status: 400 })
  }
  if (typeof mimeType !== 'string') {
    return NextResponse.json({ error: 'mimeType is required.' }, { status: 400 })
  }
  if (BLOCKED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return NextResponse.json({ error: 'Executable file types are not allowed.' }, { status: 400 })
  }

  const size = Number(fileSize)
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'fileSize is invalid.' }, { status: 400 })
  }

  const sanitizedTitle   = typeof title   === 'string' ? title.trim().slice(0, 200)    : null
  const sanitizedMessage = typeof message === 'string' ? message.trim().slice(0, 1000) : null
  const rawEmail         = typeof recipientEmail === 'string' ? recipientEmail.trim() : ''
  const sanitizedEmail   = rawEmail ? rawEmail.toLowerCase().slice(0, 320) : null

  if (sanitizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    return NextResponse.json({ error: 'Invalid recipient email address.' }, { status: 400 })
  }

  let pinHash: string | null = null
  if (pin && typeof pin === 'string' && pin !== '') {
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
    }
    pinHash = await hash(pin, BCRYPT_ROUNDS)
  }

  const token    = crypto.randomUUID()
  const safeName = (filename as string).replace(/[^a-zA-Z0-9._\-() ]/g, '_').replace(/\.\./g, '_')
  const r2Key    = `public-shares/${token}/${safeName}`
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // Create record as isReady=false; browser confirms after successful PUT
  await prisma.publicShareUpload.create({
    data: {
      token,
      r2Key,
      originalName:   (filename as string).slice(0, 500),
      fileSize:       BigInt(Math.floor(size)),
      mimeType:       mimeType.slice(0, 200),
      title:          sanitizedTitle,
      message:        sanitizedMessage,
      recipientEmail: sanitizedEmail,
      pinHash,
      expiresAt,
      uploaderIp:     ip,
      isReady:        false,
    },
  })

  // Presigned PUT URL valid for 10 minutes
  const presignedUrl = await getPresignedUploadUrl(r2Key, mimeType, 600)

  return NextResponse.json({ token, presignedUrl, expiresAt }, { status: 201 })
}
