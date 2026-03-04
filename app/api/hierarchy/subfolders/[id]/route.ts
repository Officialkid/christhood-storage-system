import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activityLog'

// ── PATCH /api/hierarchy/subfolders/[id] ─ rename ──────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { label } = await req.json()
  if (!label) return NextResponse.json({ error: 'label is required.' }, { status: 400 })

  try {
    const subfolder = await prisma.eventSubfolder.update({
      where: { id: params.id },
      data:  { label },
      include: { _count: { select: { mediaFiles: true } } },
    })
    await logActivity('SUBFOLDER_UPDATED', session.user.id, { label }, subfolder.eventId)
    return NextResponse.json({ subfolder })
  } catch (err) {
    console.error('[hierarchy/subfolders PATCH]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

// ── DELETE /api/hierarchy/subfolders/[id] ──────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subfolder = await prisma.eventSubfolder.findUnique({
    where: { id: params.id },
    include: { _count: { select: { mediaFiles: true } } },
  })
  if (!subfolder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Unlink any media files from this subfolder so the FK doesn't block deletion
  if (subfolder._count.mediaFiles > 0) {
    await prisma.mediaFile.updateMany({
      where: { subfolderId: params.id },
      data:  { subfolderId: null },
    })
  }

  await logActivity('SUBFOLDER_DELETED', session.user.id, { label: subfolder.label }, subfolder.eventId)
  await prisma.eventSubfolder.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
