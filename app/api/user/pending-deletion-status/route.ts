import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where:  { id: token.id as string },
    select: { pendingDeletionAt: true, pendingDeletionAction: true },
  })

  return NextResponse.json({
    pendingDeletionAt:     user?.pendingDeletionAt     ?? null,
    pendingDeletionAction: user?.pendingDeletionAction ?? null,
  })
}
