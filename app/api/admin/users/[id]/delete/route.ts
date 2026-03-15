import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/activityLog'

// ── GET /api/admin/users/[id]/delete ──────────────────────────
// Returns file counts so the UI can show the impact summary before confirming.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, isActive: true, email: true, username: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  const [fileCount, transferCount] = await Promise.all([
    prisma.mediaFile.count({ where: { uploaderId: params.id } }),
    prisma.transfer.count({
      where: { OR: [{ senderId: params.id }, { recipientId: params.id }] },
    }),
  ])

  return NextResponse.json({ fileCount, transferCount })
}

// ── POST /api/admin/users/[id]/delete ─────────────────────────
// Body: { action: 'reassign' | 'archive' | 'trash', reassignToId?: string }
//
// Safety rules:
//  - Cannot delete self
//  - Non-test accounts must be deactivated first (isActive must be false)
//  - "reassign" requires a valid reassignToId pointing to another user
//
// Deletion process (runs in a single transaction):
//  1. Handle the target user's MediaFiles per action choice
//  2. Re-point all other non-nullable FKs to the admin performing the deletion
//  3. Null-out ActivityLog.userId entries (preserves audit trail as anonymous)
//  4. Delete lightweight dependent records (sessions, accounts, etc.)
//  5. Delete the User record
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminId  = session.user.id
  const targetId = params.id

  if (targetId === adminId) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, isActive: true, email: true, username: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  // Non-test accounts must be deactivated before deletion
  const isTestUser =
    target.email.toLowerCase().includes('test') ||
    (target.username?.toLowerCase().includes('test') ?? false)

  if (!isTestUser && target.isActive) {
    return NextResponse.json(
      { error: 'Deactivate this account before deleting it.' },
      { status: 409 }
    )
  }

  const body: { action?: string; reassignToId?: string } = await req.json()
  const { action, reassignToId } = body

  if (!['reassign', 'archive', 'trash'].includes(action ?? '')) {
    return NextResponse.json(
      { error: 'action must be "reassign", "archive", or "trash".' },
      { status: 400 }
    )
  }

  if (action === 'reassign') {
    if (!reassignToId) {
      return NextResponse.json({ error: 'reassignToId is required for action "reassign".' }, { status: 400 })
    }
    if (reassignToId === targetId) {
      return NextResponse.json({ error: 'Cannot reassign files to the user being deleted.' }, { status: 400 })
    }
    const reassignTarget = await prisma.user.findUnique({ where: { id: reassignToId } })
    if (!reassignTarget) {
      return NextResponse.json({ error: 'Reassign target user not found.' }, { status: 404 })
    }
  }

  // Fetch all MediaFiles for this user before the transaction (needed for trash operation)
  const userFiles = await prisma.mediaFile.findMany({
    where:  { uploaderId: targetId },
    select: { id: true, status: true },
  })

  try {
    await prisma.$transaction(async (tx) => {
      // ── Step 1: Handle MediaFiles ─────────────────────────────────────────
      if (action === 'reassign' && reassignToId) {
        await tx.mediaFile.updateMany({
          where: { uploaderId: targetId },
          data:  { uploaderId: reassignToId },
        })
      } else if (action === 'archive') {
        await tx.mediaFile.updateMany({
          where: { uploaderId: targetId },
          data:  { status: 'ARCHIVED', uploaderId: adminId, archivedAt: new Date() },
        })
      } else if (action === 'trash') {
        const trashable = userFiles.filter(
          f => f.status !== 'DELETED' && f.status !== 'PURGED'
        )
        if (trashable.length > 0) {
          const scheduledPurgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          await tx.trashItem.createMany({
            data: trashable.map(f => ({
              mediaFileId:     f.id,
              deletedById:     adminId,
              scheduledPurgeAt,
              preDeleteStatus: f.status,
            })),
            skipDuplicates: true,
          })
          await tx.mediaFile.updateMany({
            where: { id: { in: trashable.map(f => f.id) } },
            data:  { status: 'DELETED', uploaderId: adminId },
          })
        }
        // Already-deleted/purged files: just re-point the uploader foreign key
        const alreadyGone = userFiles
          .filter(f => f.status === 'DELETED' || f.status === 'PURGED')
          .map(f => f.id)
        if (alreadyGone.length > 0) {
          await tx.mediaFile.updateMany({
            where: { id: { in: alreadyGone } },
            data:  { uploaderId: adminId },
          })
        }
      }

      // ── Step 2: Re-point other non-nullable FKs to the admin ─────────────
      await tx.fileVersion.updateMany({
        where: { uploadedById: targetId },
        data:  { uploadedById: adminId },
      })
      await tx.trashItem.updateMany({
        where: { deletedById: targetId },
        data:  { deletedById: adminId },
      })
      await tx.transfer.updateMany({
        where: { senderId: targetId },
        data:  { senderId: adminId },
      })
      await tx.transfer.updateMany({
        where: { recipientId: targetId },
        data:  { recipientId: adminId },
      })
      await tx.transferResponse.updateMany({
        where: { uploadedById: targetId },
        data:  { uploadedById: adminId },
      })
      // Re-attribute sent messages to admin (so message history stays intact)
      await tx.message.updateMany({
        where: { senderId: targetId },
        data:  { senderId: adminId },
      })

      // ── Step 3: Null-out ActivityLog entries (preserve audit trail) ───────
      await tx.activityLog.updateMany({
        where: { userId: targetId },
        data:  { userId: null },
      })

      // ── Step 4: Delete records that have no further FK dependencies ───────
      await tx.messageRecipient.deleteMany({ where: { recipientId: targetId } })
      await tx.zaraActionLog.deleteMany({ where: { requestedByUserId: targetId } })
      await tx.zaraUsageLog.deleteMany({ where: { userId: targetId } })
      // ShareLink deletion cascades to ShareLinkAccess
      await tx.shareLink.deleteMany({ where: { createdById: targetId } })
      // These have onDelete: Cascade in schema, but we delete explicitly to be safe
      await tx.account.deleteMany({ where: { userId: targetId } })
      await tx.session.deleteMany({ where: { userId: targetId } })
      // EventCategory.createdByUserId is setNull via onDelete: SetNull — no action needed

      // ── Step 5: Delete the user ───────────────────────────────────────────
      // All FK references are now gone or re-pointed; this will succeed.
      await tx.user.delete({ where: { id: targetId } })
    })

    await log('USER_DELETED', adminId, {
      metadata: {
        deletedUserId:    targetId,
        deletedUserEmail: target.email,
        filesAction:      action,
        reassignToId:     reassignToId ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, 'admin/users/delete')
  }
}
