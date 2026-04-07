import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const identifier = req.nextUrl.searchParams.get('identifier')?.trim()

  if (!identifier) {
    return NextResponse.json({ locked: false, failedAttempts: 0, pendingApproval: false })
  }

  const user = await prisma.user.findFirst({
    where:  { OR: [{ email: identifier }, { username: identifier }] },
    select: { failedLoginAttempts: true, lockedUntil: true, isActive: true, deactivatedAt: true },
  }).catch(() => null)

  // Never confirm whether an account exists for non-existent identifiers
  if (!user) {
    return NextResponse.json({ locked: false, failedAttempts: 0, pendingApproval: false })
  }

  // Pending approval: account is inactive but was never manually deactivated by an admin
  const pendingApproval = user.isActive === false && user.deactivatedAt === null

  const now    = new Date()
  const locked = user.lockedUntil != null && user.lockedUntil > now

  return NextResponse.json({
    locked,
    lockedUntil:        locked ? user.lockedUntil!.toISOString() : null,
    failedAttempts:     user.failedLoginAttempts,
    minutesUntilUnlock: locked
      ? Math.ceil((user.lockedUntil!.getTime() - now.getTime()) / 60_000)
      : 0,
    pendingApproval,
  })
}
