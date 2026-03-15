import { NextRequest, NextResponse } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import { prisma }                    from '@/lib/prisma'
import { log }                       from '@/lib/activityLog'
import { sendEmail }                 from '@/lib/email'

const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
const APP     = 'Christhood CMMS'

// ── POST /api/user/delete-account ─────────────────────────────────────────────
// Initiates a 24-hour grace-period deletion.
//
// Body: {
//   action:          'reassign' | 'archive' | 'trash'   — what to do with the user's files
//   confirmUsername: string                              — must match the user's current username (or email)
// }
//
// On success: marks User.pendingDeletionAt = now(), sends confirmation email,
//             notifies all admins, logs ACCOUNT_DELETION_REQUESTED.
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = token.id as string

  let body: { action?: unknown; confirmUsername?: unknown }
  try   { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const action          = typeof body.action          === 'string' ? body.action.trim()          : ''
  const confirmUsername = typeof body.confirmUsername === 'string' ? body.confirmUsername.trim() : ''

  if (!['reassign', 'archive', 'trash'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "reassign", "archive", or "trash"' },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:                true,
      username:          true,
      email:             true,
      name:              true,
      role:              true,
      pendingDeletionAt: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Admins may not self-delete; another admin must do it via the admin panel
  if (user.role === 'ADMIN') {
    return NextResponse.json(
      { error: 'Admin accounts cannot be self-deleted. Contact another administrator.' },
      { status: 400 },
    )
  }

  if (user.pendingDeletionAt) {
    return NextResponse.json({ error: 'An account deletion is already pending.' }, { status: 409 })
  }

  // Confirm the username (or email for accounts without a username)
  const matchTarget = user.username ?? user.email
  if (confirmUsername !== matchTarget) {
    return NextResponse.json(
      { error: 'The confirmation text does not match your username.' },
      { status: 400 },
    )
  }

  // Mark pending deletion
  await prisma.user.update({
    where: { id: userId },
    data:  {
      pendingDeletionAt:     new Date(),
      pendingDeletionAction: action,
    },
  })

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await log('ACCOUNT_DELETION_REQUESTED', userId, {
    metadata: { action, scheduledAt: scheduledAt.toISOString() },
  })

  // ── Email to the requesting user ──────────────────────────────────────────
  const displayName = user.name ?? user.username ?? 'there'
  await sendEmail({
    to:      user.email,
    subject: `Account Deletion Requested — ${APP}`,
    html: `
      <p>Hi ${displayName},</p>
      <p>Your account deletion request has been received.</p>
      <p>Your account will be <strong>permanently deleted in 24 hours</strong>.
         If you change your mind, you can cancel at any time by logging in and
         clicking <strong>Cancel Deletion</strong> on your Profile page.</p>
      <p>Files action chosen: <strong>${action}</strong></p>
      <p>If you did not make this request, please contact your administrator
         immediately at <a href="${APP_URL}">${APP_URL}</a>.</p>
      <p>— ${APP}</p>
    `,
  })

  // ── Notify all admin users ────────────────────────────────────────────────
  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN', isActive: true },
    select: { email: true },
  })
  if (admins.length > 0) {
    await sendEmail({
      to:      admins.map(a => a.email),
      subject: `[${APP}] Account deletion requested by ${user.username ?? user.email}`,
      html: `
        <p><strong>${user.username ?? user.email}</strong> has requested deletion of their account.</p>
        <p>File action: <strong>${action}</strong></p>
        <p>If no action is taken the account will be automatically deleted in 24 hours.
           To cancel, the user can log in and click <em>Cancel Deletion</em>.</p>
        <p><a href="${APP_URL}/admin/users">View in Admin Panel →</a></p>
      `,
    })
  }

  return NextResponse.json({
    ok:          true,
    scheduledAt: scheduledAt.toISOString(),
  })
}
