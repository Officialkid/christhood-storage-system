import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendUserApprovedEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

// ── PATCH /api/admin/users/[id] ── update role and/or approve ─────────────────
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { role, approve } = body as { role?: string; approve?: boolean }

    const validRoles = ['ADMIN', 'UPLOADER', 'EDITOR']

    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }

    // Prevent admin from demoting themselves
    if (params.id === session.user.id && role && role !== session.user.role) {
      return NextResponse.json(
        { error: 'You cannot change your own role.' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (role)    updateData.role     = role
    if (approve) updateData.isActive = true

    const user = await prisma.user.update({
      where:  { id: params.id },
      data:   updateData,
      select: { id: true, username: true, email: true, role: true, isActive: true },
    })

    // Send approval email when account is activated
    if (approve && user.isActive) {
      const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
      sendUserApprovedEmail({
        toEmail:  user.email,
        username: user.username ?? user.email,
        role:     user.role,
        loginUrl: `${appUrl}/login`,
      }).catch(e => logger.warn('APPROVE_USER_EMAIL_FAILED', {
        route: '/api/admin/users/[id]',
        error: (e as Error)?.message,
        message: 'sendUserApprovedEmail failed',
      }))
    }

    return NextResponse.json({ user })
  } catch (err) {
    return handleApiError(err, 'admin/users PATCH')
  }
}

// NOTE: User deletion is handled by POST /api/admin/users/[id]/delete
// which performs a safe 3-step flow (file reassignment → anonymisation → delete).
// The old bare prisma.user.delete() was removed because it fails with FK constraints.
