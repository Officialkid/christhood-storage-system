// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/safety/preservation.ts
//
// Zara Action Preservation — snapshot & rollback engine.
//
// FLOW (called from action-tools.ts / executePendingAction):
//
//   1. createAndSnapshotLog(toolName, args, caller)
//        → Takes a pre-action DB snapshot
//        → Creates ZaraActionLog { status: 'EXECUTING', preActionSnapshot, ... }
//        → Returns the logId
//
//   2. After execution:
//        completeActionLog(logId, result)   — success path
//        failActionLog(logId, error)        — error path
//
//   3. Admin rollback (from /api/admin/assistant/action-log/[id]/rollback):
//        rollbackAction(logId, adminCaller)
//        → Reads rollbackData from ZaraActionLog
//        → Applies inverse DB operation
//        → Creates a new ROLLED_BACK ZaraActionLog entry
//        → Marks original as ROLLED_BACK
// ─────────────────────────────────────────────────────────────────────────────

import { prisma }                           from '@/lib/prisma'
import { classifyAction, ActionRiskLevel }  from './action-classifier'
import type { CallerContext }               from '../tools/action-tools'

// ─────────────────────────────────────────────────────────────────────────────
// Internal: derive rollback TTL from risk level
// ─────────────────────────────────────────────────────────────────────────────

function rollbackTTL(toolName: string): Date | null {
  const level = classifyAction(toolName)
  const now   = Date.now()
  switch (level) {
    case ActionRiskLevel.SAFE:
    case ActionRiskLevel.MODERATE:
    case ActionRiskLevel.HIGH:
      return new Date(now + 24 * 60 * 60 * 1000)        // +24 hours
    case ActionRiskLevel.CRITICAL:
      return new Date(now + 72 * 60 * 60 * 1000)        // +72 hours
    case ActionRiskLevel.SENSITIVE:
      return null                                        // cannot roll back
    default:
      return new Date(now + 24 * 60 * 60 * 1000)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: take a DB snapshot of the affected record(s) BEFORE the action runs
// ─────────────────────────────────────────────────────────────────────────────

async function snapshotBeforeAction(
  toolName: string,
  args:     Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    switch (toolName) {

      case 'changeFileStatus': {
        const fileId = args.fileId as string
        if (!fileId) return null
        const file = await prisma.mediaFile.findUnique({
          where:  { id: fileId },
          select: { id: true, status: true, originalName: true, updatedAt: true },
        })
        return file ? { ...file } : null
      }

      case 'restoreFileFromTrash': {
        const fileId = args.fileId as string
        if (!fileId) return null
        const trashItem = await prisma.trashItem.findUnique({
          where:  { mediaFileId: fileId },
          select: {
            id: true, mediaFileId: true, deletedById: true, deletedAt: true,
            scheduledPurgeAt: true, preDeleteStatus: true,
          },
        })
        const mediaFile = await prisma.mediaFile.findUnique({
          where:  { id: fileId },
          select: { id: true, status: true, originalName: true },
        })
        return { trashItem, mediaFile }
      }

      case 'unlockUserAccount': {
        const userId = args.userId as string
        if (!userId) return null
        const user = await prisma.user.findUnique({
          where:  { id: userId },
          select: { id: true, failedLoginAttempts: true, lockedUntil: true },
        })
        return user ? { ...user } : null
      }

      case 'resetUserPassword': {
        // We NEVER snapshot the passwordHash. Just record intent.
        const userId = args.userId as string
        return {
          userId,
          note: `Password reset requested at ${new Date().toISOString()}. Previous password remains valid until user uses the reset link.`,
        }
      }

      // createEvent and flagIssueToAdmin have no meaningful pre-action state
      case 'createEvent':
      case 'flagIssueToAdmin':
      default:
        return null
    }
  } catch {
    // Snapshot failures should never block the action itself
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: build rollback payload from results of execution
// ─────────────────────────────────────────────────────────────────────────────

function buildRollbackData(
  toolName:         string,
  args:             Record<string, unknown>,
  preSnapshot:      Record<string, unknown> | null,
  postActionResult: string | undefined,
): Record<string, unknown> | null {
  switch (toolName) {

    case 'changeFileStatus': {
      // Rollback = change status back to what it was
      const snapshot = preSnapshot as { id?: string; status?: string; originalName?: string } | null
      if (!snapshot?.status) return null
      return { fileId: args.fileId, previousStatus: snapshot.status, fileName: args.fileName }
    }

    case 'restoreFileFromTrash': {
      // Rollback = re-delete the file (recreate trash record)
      const snap = preSnapshot as { trashItem?: Record<string, unknown> } | null
      if (!snap?.trashItem) return null
      return {
        mediaFileId:       args.fileId,
        preDeleteStatus:   (snap.trashItem as { preDeleteStatus?: string }).preDeleteStatus,
        deletedById:       (snap.trashItem as { deletedById?: string }).deletedById,
        scheduledPurgeAt:  (snap.trashItem as { scheduledPurgeAt?: string }).scheduledPurgeAt,
      }
    }

    case 'unlockUserAccount': {
      // Rollback = restore the previous locked state
      const snap = preSnapshot as { id?: string; failedLoginAttempts?: number; lockedUntil?: string | null } | null
      if (!snap) return null
      return {
        userId:               args.userId,
        failedLoginAttempts:  snap.failedLoginAttempts ?? 0,
        lockedUntil:          snap.lockedUntil ?? null,
      }
    }

    case 'createEvent': {
      // Rollback = delete the event if it has no files.
      // We try to extract the event name to find it if we don't have a direct ID.
      // postActionResult is the success string, event ID comes from a re-query.
      return {
        eventName:    args.eventName,
        categoryName: args.categoryName,
        year:         args.year,
        note:         'Event can be deleted from Admin → Folder Hierarchy if it has no files.',
      }
    }

    // resetUserPassword & flagIssueToAdmin: can't be rolled back
    case 'resetUserPassword':
    case 'flagIssueToAdmin':
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called at the START of executePendingAction, before writing to the DB.
 * Creates the ZaraActionLog entry and returns its id for subsequent updates.
 */
export async function createAndSnapshotLog(
  toolName:   string,
  args:       Record<string, unknown>,
  caller:     CallerContext,
  confirmedAt: Date,
): Promise<string> {
  const riskLevel      = classifyAction(toolName)
  const preActionSnapshot = await snapshotBeforeAction(toolName, args)

  const log = await prisma.zaraActionLog.create({
    data: {
      actionType:         toolName,
      riskLevel:          riskLevel as string,
      requestedByUserId:  caller.userId,
      requestedByName:    caller.userName,
      confirmedAt,
      executedAt:         new Date(),
      status:             'EXECUTING',
      inputArgs:          args as never,
      preActionSnapshot:  preActionSnapshot as never ?? undefined,
    },
  })

  return log.id
}

/**
 * Called AFTER a successful execution.
 * Updates the log with the result and rollback data.
 */
export async function completeActionLog(
  logId:            string,
  toolName:         string,
  args:             Record<string, unknown>,
  postActionResult: string | undefined,
  preSnapshot:      Record<string, unknown> | null,
): Promise<void> {
  const rollbackData     = buildRollbackData(toolName, args, preSnapshot, postActionResult)
  const rollbackAvailableUntil = rollbackTTL(toolName)

  await prisma.zaraActionLog.update({
    where: { id: logId },
    data: {
      status:                'EXECUTED',
      completedAt:           new Date(),
      postActionResult:      postActionResult ? { message: postActionResult } : undefined,
      rollbackData:          rollbackData as never ?? undefined,
      rollbackAvailableUntil: rollbackAvailableUntil ?? undefined,
    },
  })
}

/**
 * Called when the execution throws an error.
 */
export async function failActionLog(
  logId:     string,
  errorMsg:  string,
): Promise<void> {
  await prisma.zaraActionLog.update({
    where: { id: logId },
    data: {
      status:      'FAILED',
      completedAt: new Date(),
      notes:       errorMsg,
    },
  })
}

/**
 * Execute a rollback of a previously logged action.
 * Called from the admin panel → /api/admin/assistant/action-log/[id]/rollback
 *
 * Returns { success: true, message } or { success: false, error }.
 */
export async function rollbackAction(
  logId:         string,
  adminCaller:   CallerContext,
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const log = await prisma.zaraActionLog.findUnique({ where: { id: logId } })

  if (!log) {
    return { success: false, error: 'Action log entry not found.' }
  }
  if (log.status !== 'EXECUTED') {
    return { success: false, error: `Cannot roll back an action with status "${log.status}".` }
  }
  if (!log.rollbackData) {
    return { success: false, error: 'This action has no rollback data — it cannot be reversed automatically.' }
  }
  if (log.rollbackAvailableUntil && log.rollbackAvailableUntil < new Date()) {
    return { success: false, error: 'The rollback window for this action has expired.' }
  }

  const rb = log.rollbackData as Record<string, unknown>

  try {
    let rollbackMsg: string

    switch (log.actionType) {

      case 'changeFileStatus': {
        const { fileId, previousStatus, fileName } = rb as {
          fileId: string; previousStatus: string; fileName: string
        }
        await prisma.mediaFile.update({
          where: { id: fileId },
          data:  { status: previousStatus as never },
        })
        rollbackMsg = `"${fileName}" has been reverted to ${previousStatus}.`
        break
      }

      case 'restoreFileFromTrash': {
        const { mediaFileId, preDeleteStatus, deletedById, scheduledPurgeAt } = rb as {
          mediaFileId: string; preDeleteStatus: string; deletedById: string; scheduledPurgeAt: string
        }
        // Re-delete: set file status to DELETED and re-create TrashItem
        await prisma.$transaction([
          prisma.mediaFile.update({
            where: { id: mediaFileId },
            data:  { status: 'DELETED' as never },
          }),
          prisma.trashItem.upsert({
            where:  { mediaFileId },
            create: {
              mediaFileId,
              deletedById,
              preDeleteStatus: preDeleteStatus as never,
              scheduledPurgeAt: new Date(scheduledPurgeAt),
            },
            update: {
              deletedById,
              preDeleteStatus: preDeleteStatus as never,
              scheduledPurgeAt: new Date(scheduledPurgeAt),
            },
          }),
        ])
        rollbackMsg = `File has been re-deleted and returned to trash.`
        break
      }

      case 'unlockUserAccount': {
        const { userId, failedLoginAttempts, lockedUntil } = rb as {
          userId: string; failedLoginAttempts: number; lockedUntil: string | null
        }
        await prisma.user.update({
          where: { id: userId },
          data: {
            failedLoginAttempts,
            lockedUntil: lockedUntil ? new Date(lockedUntil) : null,
          },
        })
        rollbackMsg = `Account has been restored to its previous locked state.`
        break
      }

      case 'createEvent': {
        const { eventName, categoryName, year } = rb as {
          eventName: string; categoryName: string; year: number
        }
        // Attempt to find and delete the event (only if empty)
        const yearModel = await prisma.year.findUnique({ where: { year: year as number } })
        if (!yearModel) {
          return { success: false, error: 'Could not find the year record. Event rollback aborted.' }
        }
        const category = await prisma.eventCategory.findFirst({
          where: { yearId: yearModel.id, name: categoryName },
        })
        if (!category) {
          return { success: false, error: 'Could not find the event category. Event rollback aborted.' }
        }
        const event = await prisma.event.findFirst({
          where: { categoryId: category.id, name: eventName },
        })
        if (!event) {
          return { success: false, error: 'Event not found — it may have already been deleted.' }
        }
        const fileCount = await prisma.mediaFile.count({ where: { eventId: event.id } })
        if (fileCount > 0) {
          return { success: false, error: `Cannot delete "${eventName}" — it already contains ${fileCount} file(s). Remove the files first.` }
        }
        await prisma.event.delete({ where: { id: event.id } })
        rollbackMsg = `Event "${eventName}" has been deleted.`
        break
      }

      default:
        return { success: false, error: `No rollback handler for action type "${log.actionType}".` }
    }

    // Mark original as ROLLED_BACK
    await prisma.zaraActionLog.update({
      where: { id: logId },
      data:  { status: 'ROLLED_BACK', notes: `Rolled back by ${adminCaller.userName} at ${new Date().toISOString()}` },
    })

    // Create a companion ROLLBACK log entry for the audit trail
    await prisma.zaraActionLog.create({
      data: {
        actionType:        `ROLLBACK_${log.actionType}`,
        riskLevel:         'MODERATE',
        requestedByUserId: adminCaller.userId,
        requestedByName:   adminCaller.userName,
        confirmedAt:       new Date(),
        executedAt:        new Date(),
        completedAt:       new Date(),
        status:            'EXECUTED',
        inputArgs:         { originalLogId: logId, ...rb } as never,
        postActionResult:  { message: rollbackMsg } as never,
      },
    })

    return { success: true, message: rollbackMsg }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.zaraActionLog.update({
      where: { id: logId },
      data:  { notes: `Rollback attempt failed: ${msg}` },
    })
    return { success: false, error: `Rollback failed: ${msg}` }
  }
}
