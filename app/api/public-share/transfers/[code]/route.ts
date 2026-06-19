import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { deriveTransferLabel } from '@/lib/publicShareTransfers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params

  const records = await prisma.publicShareUpload.findMany({
    where: {
      transferCode: code,
      isReady: true,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      token: true,
      originalName: true,
      folderPath: true,
      fileSize: true,
      mimeType: true,
      title: true,
      message: true,
      expiresAt: true,
      downloadCount: true,
      pinHash: true,
      createdAt: true,
      transferToken: true,
      transferCode: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (records.length === 0) {
    return NextResponse.json({ error: 'Transfer not found or has expired.' }, { status: 404 })
  }

  const protectedRecord = records.find(record => record.pinHash)
  if (protectedRecord) {
    const pin = req.nextUrl.searchParams.get('pin') ?? ''
    if (!pin) {
      return NextResponse.json({ error: 'PIN required.', pinRequired: true }, { status: 401 })
    }

    const ok = await compare(pin, protectedRecord.pinHash!)
    if (!ok) {
      return NextResponse.json({ error: 'Incorrect PIN.', pinRequired: true }, { status: 403 })
    }
  }

  const bundleName = deriveTransferLabel(
    records[0].title,
    records.map(record => ({
      originalName: record.originalName,
      folderPath: record.folderPath,
    })),
  )

  return NextResponse.json({
    transferToken: records[0].transferToken,
    transferCode: records[0].transferCode,
    bundleName,
    title: records[0].title,
    message: records[0].message,
    expiresAt: records[0].expiresAt,
    createdAt: records[0].createdAt,
    totalSize: records.reduce((sum, record) => sum + Number(record.fileSize), 0),
    downloadCount: records.reduce((sum, record) => sum + record.downloadCount, 0),
    pinRequired: Boolean(protectedRecord),
    files: records.map(record => ({
      id: record.id,
      token: record.token,
      originalName: record.originalName,
      folderPath: record.folderPath,
      fileSize: record.fileSize.toString(),
      mimeType: record.mimeType,
      downloadCount: record.downloadCount,
    })),
  })
}
