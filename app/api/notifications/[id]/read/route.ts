import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/** PATCH /api/notifications/[id]/read — mark one notification as read */
export async function PATCH(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notification = await prisma.notification.findUnique({ where: { id: params.id } })
  if (!notification)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (notification.userId !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.notification.update({ where: { id: params.id }, data: { read: true } })
  return NextResponse.json({ ok: true })
}
