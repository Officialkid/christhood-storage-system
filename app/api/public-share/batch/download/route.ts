import { NextRequest } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import archiver from 'archiver'
import { compare } from 'bcryptjs'
import { PassThrough, Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { prisma } from '@/lib/prisma'
import { BUCKET, R2 } from '@/lib/r2'
import { buildTransferArchivePath, deriveTransferLabel, sanitizeTransferLabel } from '@/lib/publicShareTransfers'

export const runtime = 'nodejs'
export const maxDuration = 300

function asArchiveStream(body: unknown): Readable {
  if (body instanceof Readable) {
    return body
  }

  if (body && typeof body === 'object') {
    const candidate = body as {
      pipe?: unknown
      transformToWebStream?: () => NodeReadableStream
    }

    if (typeof candidate.pipe === 'function') {
      return body as Readable
    }

    if (typeof candidate.transformToWebStream === 'function') {
      return Readable.fromWeb(candidate.transformToWebStream())
    }
  }

  throw new TypeError('Unsupported R2 response body for ZIP streaming.')
}

function getTokens(req: NextRequest): string[] {
  const raw = req.nextUrl.searchParams.get('tokens') ?? ''
  return raw.split(',').map(token => token.trim()).filter(Boolean).slice(0, 100)
}

export async function GET(req: NextRequest) {
  const tokens = getTokens(req)
  if (tokens.length === 0) {
    return Response.json({ error: 'tokens query param is required.' }, { status: 400 })
  }

  const records = await prisma.publicShareUpload.findMany({
    where: {
      token: { in: tokens },
      isReady: true,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      token: true,
      r2Key: true,
      originalName: true,
      folderPath: true,
      fileSize: true,
      title: true,
      pinHash: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (records.length === 0) {
    return Response.json({ error: 'No files found for this transfer.' }, { status: 404 })
  }

  const protectedRecord = records.find(record => record.pinHash)
  if (protectedRecord) {
    const pin = req.nextUrl.searchParams.get('pin') ?? ''
    if (!pin) {
      return Response.json({ error: 'PIN required.', pinRequired: true }, { status: 401 })
    }

    const ok = await compare(pin, protectedRecord.pinHash!)
    if (!ok) {
      return Response.json({ error: 'Incorrect PIN.', pinRequired: true }, { status: 403 })
    }
  }

  const bundleName = deriveTransferLabel(
    records[0].title,
    records.map(record => ({
      originalName: record.originalName,
      folderPath: record.folderPath,
    })),
  )

  const archive = archiver('zip', { zlib: { level: 9 } })
  const output = new PassThrough()

  archive.on('error', (error) => output.destroy(error))
  archive.pipe(output)

  void (async () => {
    try {
      for (const record of records) {
        const response = await R2.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: record.r2Key,
        }))

        if (!response.Body) continue

        archive.append(asArchiveStream(response.Body), {
          name: buildTransferArchivePath(bundleName, record.folderPath, record.originalName),
        })
      }

      await archive.finalize()

      await prisma.publicShareUpload.updateMany({
        where: { id: { in: records.map(record => record.id) } },
        data: { downloadCount: { increment: 1 } },
      })
    } catch (error) {
      output.destroy(error as Error)
    }
  })()

  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${sanitizeTransferLabel(bundleName)}.zip`)}`,
      'Cache-Control': 'no-store',
    },
  })
}
