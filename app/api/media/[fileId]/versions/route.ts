import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '@/lib/r2'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/media/[fileId]/versions
// Returns the full version history for a file (sorted oldest → newest).
// Access: any authenticated user.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const versions = await prisma.fileVersion.findMany({
    where:   { mediaFileId: params.fileId },
    include: { uploadedBy: { select: { id: true, username: true, email: true } } },
    orderBy: { versionNumber: 'asc' },
  })

  // Attach presigned download URLs so the client can preview each version
  const enriched = await Promise.all(
    versions.map(async (v) => ({
      ...v,
      createdAt:   v.createdAt.toISOString(),
      downloadUrl: await getPresignedDownloadUrl(v.r2Key),
    }))
  )

  return NextResponse.json({ versions: enriched, activeR2Key: file.r2Key })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/media/[fileId]/versions  — PREPARE PHASE
// Body: { filename: string; contentType: string; fileSize: number }
//
// 1. Validates EDITOR or ADMIN role.
// 2. Calculates the next version number.
// 3. Mints a versioned R2 key.
// 4. Returns a presigned PUT URL the client uploads to directly.
// 5. Returns { uploadUrl, r2Key, nextVersion } — the client calls /confirm after upload.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role as string
  if (role === 'UPLOADER') {
    return NextResponse.json(
      { error: 'Forbidden: UPLOADERs cannot upload new versions' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { filename, contentType, fileSize } = body as {
    filename?: string
    contentType?: string
    fileSize?: number
  }

  if (!filename || !contentType || !fileSize) {
    return NextResponse.json(
      { error: 'Missing required fields: filename, contentType, fileSize' },
      { status: 400 }
    )
  }

  const file = await prisma.mediaFile.findUnique({ where: { id: params.fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Locked files cannot receive new versions
  const lockedStatuses = ['DELETED', 'PURGED']
  if (lockedStatuses.includes(file.status as string)) {
    return NextResponse.json(
      { error: `Cannot version a ${file.status?.toLowerCase()} file` },
      { status: 409 }
    )
  }

  // Determine the next version number
  const latestVersion = await prisma.fileVersion.findFirst({
    where:   { mediaFileId: params.fileId },
    orderBy: { versionNumber: 'desc' },
    select:  { versionNumber: true },
  })
  const nextVersion = (latestVersion?.versionNumber ?? 1) + 1

  // Build a versioned R2 key:  versions/<fileId>/v<N>-<uuid>-<originalFilename>
  const ext          = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  const base         = filename.includes('.')
    ? filename.slice(0, filename.lastIndexOf('.'))
    : filename
  const storedName   = `${base}_v${nextVersion}-${randomUUID()}${ext}`
  const r2Key        = `versions/${params.fileId}/${storedName}`

  const uploadUrl = await getPresignedUploadUrl(r2Key, contentType)

  return NextResponse.json({ uploadUrl, r2Key, nextVersion, storedName })
}
