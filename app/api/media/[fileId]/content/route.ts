import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canDownloadFile } from '@/lib/downloadAuth'
import { getPresignedDownloadUrl } from '@/lib/r2'

const URL_EXPIRY_SECONDS = 15 * 60

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ fileId: string }> },
) {
  const params = await props.params
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await canDownloadFile(
    session.user.id,
    session.user.role,
    params.fileId,
  )

  if (!result.allowed) {
    return NextResponse.json({ error: result.reason }, { status: 403 })
  }

  const disposition = req.nextUrl.searchParams.get('disposition') === 'inline'
    ? 'inline'
    : 'attachment'

  const { file } = result
  const filename = disposition === 'attachment' ? file.originalName : undefined
  const url = await getPresignedDownloadUrl(file.r2Key, URL_EXPIRY_SECONDS, filename)

  return NextResponse.redirect(url, { status: 302 })
}
