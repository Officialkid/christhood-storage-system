import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const EXPIRY_DAYS = 60

interface IncomingFile {
  originalName: string
  r2Key:        string
  fileSize:     number
  mimeType:     string
  folderPath:   string | null
  checksum:     string
}

/**
 * POST /api/transfers
 * Admin-only. Creates a Transfer record after all files are uploaded to R2.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, recipientId, subject, message, files, totalFiles, totalSize, folderStructure } = body

  if (!id || !recipientId || !subject || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate recipient exists
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } })
  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  const transfer = await prisma.transfer.create({
    data: {
      id,
      senderId:        session.user.id,
      recipientId,
      subject:         subject.trim(),
      message:         message?.trim() || null,
      status:          'PENDING',
      folderStructure: folderStructure ?? null,
      r2Prefix:        `transfers/${id}/`,
      totalFiles,
      totalSize:       BigInt(totalSize),
      expiresAt,
      files: {
        create: (files as IncomingFile[]).map(f => ({
          originalName: f.originalName,
          r2Key:        f.r2Key,
          fileSize:     BigInt(f.fileSize),
          mimeType:     f.mimeType,
          folderPath:   f.folderPath ?? null,
          checksum:     f.checksum,
        })),
      },
    },
    select: { id: true },
  })

  return NextResponse.json({ transferId: transfer.id })
}
