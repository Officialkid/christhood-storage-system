import { NextRequest, NextResponse }              from 'next/server'
import { getServerSession }                        from 'next-auth'
import { authOptions }                             from '@/lib/auth'
import { prisma }                                  from '@/lib/prisma'
import { putObjectBuffer, getPresignedDownloadUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * POST /api/admin/settings/logo
 * Accepts multipart/form-data with a field named "file".
 * Uploads the image to R2 at "system/logo.<ext>" and saves a
 * long-lived presigned URL in the logo_url AppSetting.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form   = await req.formData()
  const file   = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Unsupported file type. Use PNG, JPEG, WebP or SVG.' },
      { status: 400 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo must be 2 MB or smaller.' }, { status: 400 })
  }

  const buffer  = Buffer.from(await file.arrayBuffer())
  const r2Key   = `system/logo.${ext}`

  await putObjectBuffer(r2Key, buffer, file.type)

  // Presigned URL valid for 1 year
  const url = await getPresignedDownloadUrl(r2Key, 365 * 24 * 3600)

  await prisma.appSetting.upsert({
    where:  { key: 'logo_url' },
    create: { key: 'logo_url', value: url, updatedBy: session.user.id },
    update: { value: url, updatedBy: session.user.id },
  })

  return NextResponse.json({ url })
}
