import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── PATCH /api/user/onboarding ─────────────────────────────────────────────
// Body: {} → mark completed (hasCompletedOnboarding: true)
// Body: { reset: true } → reset tour (hasCompletedOnboarding: false)
// ──────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let reset = false
  try {
    const body = await req.json()
    reset = body?.reset === true
  } catch {
    // body is optional — default to marking done
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data:  { hasCompletedOnboarding: !reset },
  })

  return NextResponse.json({ success: true })
}
