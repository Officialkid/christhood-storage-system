import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── PATCH /api/admin/users/[id] ── update role ─────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { role } = await req.json()
    const validRoles = ['ADMIN', 'UPLOADER', 'EDITOR']

    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }

    // Prevent admin from demoting themselves
    if (params.id === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own role.' },
        { status: 400 }
      )
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data:  { role },
      select: { id: true, username: true, email: true, role: true },
    })

    return NextResponse.json({ user })
  } catch (err) {
    return handleApiError(err, 'admin/users PATCH')
  }
}

// NOTE: User deletion is handled by POST /api/admin/users/[id]/delete
// which performs a safe 3-step flow (file reassignment → anonymisation → delete).
// The old bare prisma.user.delete() was removed because it fails with FK constraints.
