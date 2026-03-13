// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/tools/action-tools.ts
//
// All 6 action tools for the Christhood CMMS AI Assistant (Zara).
//
// SAFETY CONTRACT:
//   1. Every tool checks the caller's role before proposing OR executing anything.
//   2. Every confirmed action is written to ActivityLog with actor metadata.
//   3. All destructive / irreversible actions go through the two-step
//      confirmation flow — they never execute automatically:
//        Step 1 → executeActionTool()  → returns { requiresConfirmation: true, pendingAction }
//        Step 2 → executePendingAction() → actually runs the DB writes
//   4. flagIssueToAdmin has NO confirmation step (non-destructive, just a message).
//   5. Pending actions expire after 5 minutes if not confirmed.
//   6. passwordHash and other secrets are NEVER read or returned.
// ─────────────────────────────────────────────────────────────────────────────

import crypto                                 from 'crypto'
import { FunctionDeclaration, SchemaType }    from '@google/generative-ai'
import { prisma }                             from '@/lib/prisma'
import { log }                                from '@/lib/activityLog'
import { sendPasswordResetEmail, sendEmail }  from '@/lib/email'
import {
  createInAppNotification,
  notifyDirectMessage,
  notifyFileRestored,
}                                             from '@/lib/notifications'
import { CATEGORY_NAMES }                     from '@/lib/hierarchyConstants'
import { recordActionExecuted, recordActionCancelled } from '@/lib/assistant/tool-telemetry'
import {
  createAndSnapshotLog,
  completeActionLog,
  failActionLog,
}                                             from '@/lib/assistant/safety/preservation'
import type { AppRole }                       from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface CallerContext {
  userId:   string
  userName: string
  role:     AppRole
}

/** A pending (unconfirmed) action stored in memory. */
export interface PendingAction {
  id:       string
  toolName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args:     Record<string, any>
  userId:   string
  expiresAt: Date
}

/** Result returned from executeActionTool or executePendingAction. */
export type ActionResult =
  | { requiresConfirmation: true;  confirmationMessage: string; pendingAction: PendingAction; result?: never; error?: never }
  | { requiresConfirmation: false; result: string;                pendingAction?: never;       error?: never; confirmationMessage?: never }
  | { requiresConfirmation: false; error: string;                 pendingAction?: never;       result?: never; confirmationMessage?: never }

// ─────────────────────────────────────────────────────────────────────────────
// In-memory pending action store  (module-level, request-safe)
// ─────────────────────────────────────────────────────────────────────────────

/** Map<actionId, PendingAction> — lazy expiry checked on every read. */
const _pending = new Map<string, PendingAction>()
const PENDING_TTL_MS = 5 * 60 * 1000  // 5 minutes

function storePending(toolName: string, args: Record<string, unknown>, userId: string): PendingAction {
  const id     = crypto.randomUUID()
  const action: PendingAction = {
    id,
    toolName,
    args,
    userId,
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  }
  _pending.set(id, action)
  return action
}

/** Retrieve and consume a pending action (deletes it after retrieval). */
export function popPendingAction(actionId: string): PendingAction | null {
  const action = _pending.get(actionId)
  if (!action) return null
  _pending.delete(actionId)
  if (action.expiresAt < new Date()) return null  // expired
  return action
}

/** List all non-expired pending actions — for the admin debug panel. */
export function listPendingActions(): PendingAction[] {
  const now    = Date.now()
  const active: PendingAction[] = []
  for (const [id, action] of _pending.entries()) {
    if (action.expiresAt.getTime() > now) {
      active.push(action)
    } else {
      _pending.delete(id)   // lazy cleanup
    }
  }
  return active
}

/** Cancel a pending action — removes it without executing. Returns the action or null if not found. */
export function cancelPendingAction(
  actionId: string,
  cancelledBy: { userId: string; userName: string },
): PendingAction | null {
  const action = _pending.get(actionId)
  if (!action) return null
  _pending.delete(actionId)
  recordActionCancelled(
    action.toolName,
    cancelledBy.userId,
    cancelledBy.userName,
    `${action.toolName} cancelled by admin`,
  )
  return action
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1 — restoreFileFromTrash
// ─────────────────────────────────────────────────────────────────────────────

const restoreFileFromTrashDecl: FunctionDeclaration = {
  name: 'restoreFileFromTrash',
  description:
    'Restore a file that was deleted and is currently in the trash. ' +
    'Use when a user reports a missing file that may have been deleted, or when an admin ' +
    'wants to recover a deleted file. Always confirm before restoring.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fileId: {
        type: SchemaType.STRING,
        description: 'The MediaFile id to restore. Use getTrashContents to find the ID first if the user only gave a name.',
      },
      fileName: {
        type: SchemaType.STRING,
        description: 'The file name — used in the confirmation message.',
      },
    },
    required: ['fileId', 'fileName'],
  },
}

async function proposeRestoreFile(
  args: { fileId: string; fileName: string },
  caller: CallerContext,
): Promise<ActionResult> {
  if (caller.role !== 'ADMIN') {
    return {
      requiresConfirmation: false,
      error: 'Only admins can restore deleted files. Please ask your admin.',
    }
  }

  const trashItem = await prisma.trashItem.findUnique({
    where:   { mediaFileId: args.fileId },
    include: {
      mediaFile: {
        include: {
          event:    { include: { category: { include: { year: true } } } },
          uploader: { select: { id: true, name: true, username: true } },
        },
      },
      deletedBy: { select: { name: true, username: true } },
    },
  })

  if (!trashItem) {
    return {
      requiresConfirmation: false,
      error: `"${args.fileName}" is not in the trash — it may have already been restored or permanently deleted.`,
    }
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((trashItem.scheduledPurgeAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  )
  const deletedBy  = trashItem.deletedBy.username ?? trashItem.deletedBy.name ?? 'an admin'
  const deletedAt  = fmtDateTime(trashItem.deletedAt)
  const eventLabel =
    `${trashItem.mediaFile.event.category.year.year} → ` +
    `${trashItem.mediaFile.event.category.name} → ` +
    `${trashItem.mediaFile.event.name}`

  const confirmationMessage =
    `I found **${trashItem.mediaFile.originalName}** in the trash — ` +
    `it was deleted by ${deletedBy} on ${deletedAt} ` +
    `and has ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} before it's permanently gone.\n` +
    `Restore it to **${eventLabel}**?`

  const pending = storePending('restoreFileFromTrash', { fileId: args.fileId, fileName: args.fileName }, caller.userId)

  return { requiresConfirmation: true, confirmationMessage, pendingAction: pending }
}

async function executeRestoreFile(
  args:   { fileId: string; fileName: string },
  caller: CallerContext,
): Promise<ActionResult> {
  const trashItem = await prisma.trashItem.findUnique({
    where:   { mediaFileId: args.fileId },
    include: {
      mediaFile: {
        include: {
          event:    { include: { category: { include: { year: true } } } },
          uploader: { select: { id: true, name: true, username: true } },
        },
      },
    },
  })

  if (!trashItem) {
    return { requiresConfirmation: false, error: `Could not restore "${args.fileName}" — it was not found in the trash.` }
  }

  const restoredStatus = trashItem.preDeleteStatus
  const uploaderName   = trashItem.mediaFile.uploader.username ?? trashItem.mediaFile.uploader.name ?? 'uploader'
  const eventName      = trashItem.mediaFile.event.name

  // Restore: remove trash record + reset file status
  await prisma.$transaction([
    prisma.trashItem.delete({ where: { mediaFileId: args.fileId } }),
    prisma.mediaFile.update({
      where: { id: args.fileId },
      data:  { status: restoredStatus as never },
    }),
  ])

  // Log with actor metadata so it's clear Zara performed this
  await log('FILE_RESTORED', caller.userId, {
    mediaFileId: args.fileId,
    metadata: {
      fileName:    trashItem.mediaFile.originalName,
      actor:       'ZARA_AI',
      requestedBy: caller.userId,
      note:        `Restored via AI assistant by ${caller.userName}`,
    },
  })

  // Notify all admins + editors (fire-and-forget)
  notifyFileRestored({
    fileId:  args.fileId,
    fileName: trashItem.mediaFile.originalName,
    actorId: caller.userId,
  }).catch(() => {})

  // Notify the original uploader directly
  createInAppNotification(
    trashItem.mediaFile.uploader.id,
    `Your file "${trashItem.mediaFile.originalName}" has been restored by the admin via Zara.`,
    `/media/${args.fileId}`,
  ).catch(() => {})

  return {
    requiresConfirmation: false,
    result: `Done! **${trashItem.mediaFile.originalName}** has been restored and is back in **${eventName}**. 🎉`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2 — resetUserPassword
// ─────────────────────────────────────────────────────────────────────────────

const resetUserPasswordDecl: FunctionDeclaration = {
  name: 'resetUserPassword',
  description:
    'Trigger a password reset for a user who is locked out or cannot log in. ' +
    'This sends them a reset email. Use when an admin asks to reset someone\'s password ' +
    'or when a user reports they cannot log in.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      userId: {
        type: SchemaType.STRING,
        description: 'The user ID. Use findUser to look this up if you only have a name.',
      },
      userName: {
        type: SchemaType.STRING,
        description: 'The user\'s name — used in the confirmation message.',
      },
      userEmail: {
        type: SchemaType.STRING,
        description: 'The email address where the reset link will be sent.',
      },
    },
    required: ['userId', 'userName', 'userEmail'],
  },
}

async function proposeResetPassword(
  args: { userId: string; userName: string; userEmail: string },
  caller: CallerContext,
): Promise<ActionResult> {
  if (caller.role !== 'ADMIN') {
    return {
      requiresConfirmation: false,
      error: 'Only admins can reset passwords. If you\'re locked out, use the "Forgot password" link on the login page.',
    }
  }

  // Verify the user exists
  const user = await prisma.user.findUnique({
    where:  { id: args.userId },
    select: { id: true, email: true, username: true, name: true },
  })

  if (!user) {
    return { requiresConfirmation: false, error: `User "${args.userName}" not found.` }
  }

  // Use the real email from DB, not the arg (protect against injection)
  const safeEmail = user.email

  const confirmationMessage =
    `I'll send a password reset email to **${args.userName}** at **${safeEmail}**.\n` +
    `They'll get a link to set a new password. Shall I send it?`

  const pending = storePending(
    'resetUserPassword',
    { userId: args.userId, userName: args.userName, userEmail: safeEmail },
    caller.userId,
  )

  return { requiresConfirmation: true, confirmationMessage, pendingAction: pending }
}

async function executeResetPassword(
  args:   { userId: string; userName: string; userEmail: string },
  caller: CallerContext,
): Promise<ActionResult> {
  const user = await prisma.user.findUnique({
    where:  { id: args.userId },
    select: { id: true, email: true, username: true, name: true },
  })

  if (!user) {
    return { requiresConfirmation: false, error: `User "${args.userName}" not found.` }
  }

  // Invalidate stale tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data:  { used: true },
  })

  // Create new token (24 h expiry)
  const token     = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  })

  // Send email (fire-and-forget relative to logging — but we await it)
  await sendPasswordResetEmail(user.email, user.username ?? user.name ?? user.email, token)

  // Log
  await log('PASSWORD_RESET_TRIGGERED' as never, caller.userId, {
    metadata: {
      targetUserId: user.id,
      actor:        'ZARA_AI',
      requestedBy:  caller.userId,
      note:         `Password reset triggered via AI assistant by ${caller.userName}`,
    },
  })

  return {
    requiresConfirmation: false,
    result: `Done! **${args.userName}** will receive the reset email at ${user.email} within a minute.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3 — unlockUserAccount
// ─────────────────────────────────────────────────────────────────────────────

const unlockUserAccountDecl: FunctionDeclaration = {
  name: 'unlockUserAccount',
  description:
    'Unlock a user account that has been locked due to too many failed login attempts. ' +
    'Use when a user reports they cannot log in and their account may be locked.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      userId: {
        type: SchemaType.STRING,
        description: 'The user ID. Use findUser to look this up if you only have a name.',
      },
      userName: {
        type: SchemaType.STRING,
        description: 'The user\'s name — used in the confirmation message.',
      },
    },
    required: ['userId', 'userName'],
  },
}

async function proposeUnlockAccount(
  args: { userId: string; userName: string },
  caller: CallerContext,
): Promise<ActionResult> {
  if (caller.role !== 'ADMIN') {
    return {
      requiresConfirmation: false,
      error: 'Only admins can unlock accounts. Please contact your admin.',
    }
  }

  const user = await prisma.user.findUnique({
    where:  { id: args.userId },
    select: { id: true, failedLoginAttempts: true, lockedUntil: true },
  })

  if (!user) {
    return { requiresConfirmation: false, error: `User "${args.userName}" not found.` }
  }

  const isLocked = !!(user.lockedUntil && user.lockedUntil > new Date())

  if (!isLocked) {
    return {
      requiresConfirmation: false,
      result: `**${args.userName}'s** account is not locked — they should be able to log in normally.`,
    }
  }

  const lockedUntil     = fmtDateTime(user.lockedUntil!)
  const failedAttempts  = user.failedLoginAttempts

  const confirmationMessage =
    `**${args.userName}'s** account is currently locked until ${lockedUntil} ` +
    `due to ${failedAttempts} failed login attempt${failedAttempts === 1 ? '' : 's'}.\n` +
    `Unlock their account now?`

  const pending = storePending('unlockUserAccount', { userId: args.userId, userName: args.userName }, caller.userId)

  return { requiresConfirmation: true, confirmationMessage, pendingAction: pending }
}

async function executeUnlockAccount(
  args:   { userId: string; userName: string },
  caller: CallerContext,
): Promise<ActionResult> {
  const user = await prisma.user.update({
    where:  { id: args.userId },
    data:   { failedLoginAttempts: 0, lockedUntil: null },
    select: { id: true, email: true },
  })

  await log('USER_UNLOCKED', caller.userId, {
    metadata: {
      unlockedUserId: user.id,
      unlockedEmail:  user.email,
      actor:          'ZARA_AI',
      requestedBy:    caller.userId,
      note:           `Account unlocked via AI assistant by ${caller.userName}`,
    },
  })

  // Notify the unlocked user
  createInAppNotification(
    args.userId,
    'Your account has been unlocked by an admin. You can log in now.',
  ).catch(() => {})

  return {
    requiresConfirmation: false,
    result: `**${args.userName}'s** account is unlocked. They can log in now.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 4 — changeFileStatus
// ─────────────────────────────────────────────────────────────────────────────

const changeFileStatusDecl: FunctionDeclaration = {
  name: 'changeFileStatus',
  description:
    'Change the status of a file — for example marking it as Editing In Progress, ' +
    'Edited, or Published. Use when a user asks to update a file\'s status through the assistant.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fileId: {
        type: SchemaType.STRING,
        description: 'The file ID. Use searchFiles to find it if you only have a name.',
      },
      fileName: {
        type: SchemaType.STRING,
        description: 'The file name — used in the confirmation message.',
      },
      newStatus: {
        type: SchemaType.STRING,
        enum: ['EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED'],
        description: 'The new status to set.',
      },
      currentStatus: {
        type: SchemaType.STRING,
        description: 'The current file status — used in the confirmation message.',
      },
    },
    required: ['fileId', 'fileName', 'newStatus', 'currentStatus'],
  },
}

/** EDITOR-safe status transitions: from → allowed targets */
const EDITOR_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  RAW:                 ['EDITING_IN_PROGRESS'],
  EDITING_IN_PROGRESS: ['EDITED'],
  EDITED:              ['PUBLISHED'],
  PUBLISHED:           [],           // editors cannot un-publish
  ARCHIVED:            [],           // editors cannot un-archive
}

async function proposeChangeStatus(
  args: { fileId: string; fileName: string; newStatus: string; currentStatus: string },
  caller: CallerContext,
): Promise<ActionResult> {
  if (caller.role === 'UPLOADER') {
    return {
      requiresConfirmation: false,
      error: 'Status changes are for Editors and Admins — let your editor know the file is ready!',
    }
  }

  // Validate the file exists
  const file = await prisma.mediaFile.findUnique({
    where:  { id: args.fileId },
    select: { id: true, status: true, originalName: true },
  })

  if (!file) {
    return { requiresConfirmation: false, error: `File "${args.fileName}" not found.` }
  }

  if (file.status === 'DELETED' || file.status === 'PURGED') {
    return {
      requiresConfirmation: false,
      error: `"${file.originalName}" has been deleted and its status cannot be changed.`,
    }
  }

  // EDITOR transition check
  if (caller.role === 'EDITOR') {
    const allowed = EDITOR_ALLOWED_TRANSITIONS[file.status] ?? []
    if (!allowed.includes(args.newStatus)) {
      return {
        requiresConfirmation: false,
        error:
          `You can only move a file forward through the workflow. ` +
          `"${file.originalName}" is currently **${file.status}** — ` +
          (allowed.length > 0
            ? `you can change it to: ${allowed.join(', ')}.`
            : `there are no further status changes available to you for this file.`),
      }
    }
  }

  const confirmationMessage =
    `Change **${args.fileName}** from **${args.currentStatus}** to **${args.newStatus}**?`

  const pending = storePending(
    'changeFileStatus',
    { fileId: args.fileId, fileName: args.fileName, newStatus: args.newStatus, currentStatus: args.currentStatus },
    caller.userId,
  )

  return { requiresConfirmation: true, confirmationMessage, pendingAction: pending }
}

async function executeChangeStatus(
  args:   { fileId: string; fileName: string; newStatus: string; currentStatus: string },
  caller: CallerContext,
): Promise<ActionResult> {
  const oldFile = await prisma.mediaFile.findUnique({
    where:  { id: args.fileId },
    select: { status: true, originalName: true },
  })

  if (!oldFile) {
    return { requiresConfirmation: false, error: `File "${args.fileName}" not found.` }
  }

  await prisma.mediaFile.update({
    where: { id: args.fileId },
    data:  { status: args.newStatus as never },
  })

  await log('STATUS_CHANGED', caller.userId, {
    mediaFileId: args.fileId,
    metadata: {
      oldStatus:   oldFile.status,
      newStatus:   args.newStatus,
      fileName:    oldFile.originalName,
      actor:       'ZARA_AI',
      requestedBy: caller.userId,
      note:        `Status changed via AI assistant by ${caller.userName}`,
    },
  })

  const label = args.newStatus.replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())

  return {
    requiresConfirmation: false,
    result: `Done! **${args.fileName}** is now marked as **${label}**. 🎉`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 5 — createEvent
// ─────────────────────────────────────────────────────────────────────────────

const createEventDecl: FunctionDeclaration = {
  name: 'createEvent',
  description:
    'Create a new event folder in the CMMS. Use when an admin asks to set up a new event ' +
    'so the team can start uploading to it.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      eventName: {
        type: SchemaType.STRING,
        description: 'The name of the new event, e.g. "School A Mission" or "Saturday Fellowship March 2026".',
      },
      categoryName: {
        type: SchemaType.STRING,
        enum: [...CATEGORY_NAMES],
        description: 'The event category. Must be one of the established categories.',
      },
      eventDate: {
        type: SchemaType.STRING,
        description: 'The event date in ISO format, e.g. "2026-03-15".',
      },
      year: {
        type: SchemaType.NUMBER,
        description: 'The year the event belongs to. Defaults to the current year if omitted.',
      },
      subfolders: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: 'Optional subfolder labels to create inside the event, e.g. ["Friday", "Saturday", "Sunday"].',
      },
    },
    required: ['eventName', 'categoryName', 'eventDate'],
  },
}

async function proposeCreateEvent(
  args: {
    eventName:    string
    categoryName: string
    eventDate:    string
    year?:        number
    subfolders?:  string[]
  },
  caller: CallerContext,
): Promise<ActionResult> {
  if (caller.role !== 'ADMIN') {
    return {
      requiresConfirmation: false,
      error: 'Only admins can create events. Please ask your admin to set it up.',
    }
  }

  if (!(CATEGORY_NAMES as readonly string[]).includes(args.categoryName)) {
    return {
      requiresConfirmation: false,
      error: `"${args.categoryName}" is not a valid category. Valid categories: ${CATEGORY_NAMES.join(', ')}.`,
    }
  }

  const eventYear   = args.year ?? new Date().getFullYear()
  const subfolders  = args.subfolders ?? []
  const parsedDate  = new Date(args.eventDate)

  if (isNaN(parsedDate.getTime())) {
    return { requiresConfirmation: false, error: `"${args.eventDate}" is not a valid date.` }
  }

  // Check for duplicate (pre-flight, don't create anything yet)
  const existingYear = await prisma.year.findUnique({ where: { year: eventYear } })
  if (existingYear) {
    const existingCat = await prisma.eventCategory.findFirst({
      where: { yearId: existingYear.id, name: args.categoryName },
    })
    if (existingCat) {
      const duplicate = await prisma.event.findFirst({
        where: { categoryId: existingCat.id, name: args.eventName },
      })
      if (duplicate) {
        return {
          requiresConfirmation: false,
          error: `An event named **${args.eventName}** already exists in ${eventYear} → ${args.categoryName}.`,
        }
      }
    }
  }

  const subfoldersLine =
    subfolders.length > 0
      ? `Subfolders: ${subfolders.join(', ')}`
      : 'No subfolders'

  const confirmationMessage =
    `Create a new event:\n` +
    `📁 **${eventYear} → ${args.categoryName} → ${args.eventName}**\n` +
    `Date: ${fmtDate(parsedDate)}\n` +
    `${subfoldersLine}\n` +
    `Ready to create it?`

  const pending = storePending(
    'createEvent',
    {
      eventName:    args.eventName,
      categoryName: args.categoryName,
      eventDate:    args.eventDate,
      year:         eventYear,
      subfolders,
    },
    caller.userId,
  )

  return { requiresConfirmation: true, confirmationMessage, pendingAction: pending }
}

async function executeCreateEvent(
  args: {
    eventName:    string
    categoryName: string
    eventDate:    string
    year:         number
    subfolders:   string[]
  },
  caller: CallerContext,
): Promise<ActionResult> {
  const { eventName, categoryName, eventDate, year: eventYear, subfolders } = args

  // Upsert Year
  let year = await prisma.year.findUnique({ where: { year: eventYear } })
  if (!year) {
    year = await prisma.year.create({ data: { year: eventYear } })
    await log('YEAR_CREATED', caller.userId, { metadata: { year: eventYear, actor: 'ZARA_AI' } })
  }

  // Upsert EventCategory
  let category = await prisma.eventCategory.findFirst({
    where: { yearId: year.id, name: categoryName },
  })
  if (!category) {
    category = await prisma.eventCategory.create({
      data: { name: categoryName, yearId: year.id },
    })
    await log('CATEGORY_CREATED', caller.userId, {
      metadata: { name: categoryName, year: eventYear, actor: 'ZARA_AI' },
    })
  }

  // Duplicate guard
  const duplicate = await prisma.event.findFirst({
    where: { name: eventName, categoryId: category.id },
  })
  if (duplicate) {
    return {
      requiresConfirmation: false,
      error: `An event named **${eventName}** already exists in ${eventYear} → ${categoryName}.`,
    }
  }

  // Create Event
  const event = await prisma.event.create({
    data: {
      name:       eventName,
      date:       new Date(eventDate),
      categoryId: category.id,
    },
  })

  // Create Subfolders
  if (subfolders.length > 0) {
    await prisma.eventSubfolder.createMany({
      data: subfolders.map(label => ({ label, eventId: event.id })),
    })
  }

  await log('FOLDER_CREATED', caller.userId, {
    eventId: event.id,
    metadata: {
      folderType:   'event',
      folderName:   eventName,
      categoryName,
      year:         eventYear,
      subfolders,
      actor:        'ZARA_AI',
      requestedBy:  caller.userId,
      note:         `Event created via AI assistant by ${caller.userName}`,
    },
  })

  return {
    requiresConfirmation: false,
    result:
      `Done! **${eventName}** is ready. The team can now upload to ` +
      `${eventYear} → ${categoryName} → ${eventName}. 🎉`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 6 — flagIssueToAdmin  (no confirmation required)
// ─────────────────────────────────────────────────────────────────────────────

const flagIssueToAdminDecl: FunctionDeclaration = {
  name: 'flagIssueToAdmin',
  description:
    'Flag a problem or request to the admin when the user needs admin help with something ' +
    'Zara cannot do directly. Use when the user has an issue that requires admin attention — ' +
    'like needing access to an event, reporting a bug, or requesting a feature.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      issuerName: {
        type: SchemaType.STRING,
        description: 'The name of the person reporting the issue.',
      },
      issueType: {
        type: SchemaType.STRING,
        enum: ['ACCESS_REQUEST', 'BUG_REPORT', 'ACCOUNT_ISSUE', 'OTHER'],
        description: 'The category of the issue.',
      },
      description: {
        type: SchemaType.STRING,
        description: 'A clear description of what the user needs or what went wrong.',
      },
      urgency: {
        type: SchemaType.STRING,
        enum: ['NORMAL', 'URGENT'],
        description: 'URGENT if the user is completely blocked from their work, NORMAL otherwise.',
      },
    },
    required: ['issuerName', 'issueType', 'description', 'urgency'],
  },
}

async function executeFlagIssue(
  args: { issuerName: string; issueType: string; description: string; urgency: 'NORMAL' | 'URGENT' },
  caller: CallerContext,
): Promise<ActionResult> {
  const subject = `[${args.urgency}] ${args.issueType}: ${args.issuerName} needs help`
  const body    =
    `${args.issuerName} asked Zara for help and was flagged to you:\n\n` +
    `${args.description}\n\n` +
    `Please follow up with them.`

  // Find all admin users
  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN' },
    select: { id: true, email: true },
  })

  if (admins.length === 0) {
    // Fallback — no admins in DB yet (shouldn't happen in practice)
    return {
      requiresConfirmation: false,
      result: "I've made a note of your issue. Please reach out to your admin directly if it's urgent.",
    }
  }

  // Create internal Message from the caller so it appears in the admin inbox
  const message = await prisma.message.create({
    data: {
      senderId:    caller.userId,
      subject,
      body,
      priority:    args.urgency === 'URGENT' ? 'URGENT' : 'NORMAL',
      recipients: {
        create: admins.map(a => ({ recipientId: a.id })),
      },
    },
  })

  // In-app + push notifications
  notifyDirectMessage({
    messageId:    message.id,
    senderName:   `Zara (on behalf of ${args.issuerName})`,
    subject,
    priority:     args.urgency,
    recipientIds: admins.map(a => a.id),
  }).catch(() => {})

  // Email each admin if URGENT
  if (args.urgency === 'URGENT') {
    const APP_URL = process.env.NEXTAUTH_URL ?? 'https://cmmschristhood.org'
    const link    = `${APP_URL}/messages/${message.id}`

    for (const admin of admins) {
      sendEmail({
        to:      admin.email,
        subject: `🔴 URGENT — ${subject}`,
        html:
          `<p><strong>An urgent issue was flagged via the Christhood CMMS AI Assistant.</strong></p>` +
          `<p><strong>From:</strong> ${args.issuerName}</p>` +
          `<p><strong>Type:</strong> ${args.issueType}</p>` +
          `<p><strong>Description:</strong><br>${args.description.replace(/\n/g, '<br>')}</p>` +
          `<p><a href="${link}" style="color:#6366f1;">View in CMMS →</a></p>`,
      }).catch(() => {})
    }
  }

  // Log
  await log('ISSUE_FLAGGED_TO_ADMIN' as never, caller.userId, {
    metadata: {
      issueType:   args.issueType,
      urgency:     args.urgency,
      description: args.description,
      actor:       'ZARA_AI',
      messageId:   message.id,
    },
  })

  return {
    requiresConfirmation: false,
    result:
      `I've flagged this to your admin right now with all the details. ` +
      `They'll be notified immediately and will follow up with you. 😊`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/** All 6 Gemini FunctionDeclarations for action tools. */
export const actionToolDeclarations: FunctionDeclaration[] = [
  restoreFileFromTrashDecl,
  resetUserPasswordDecl,
  unlockUserAccountDecl,
  changeFileStatusDecl,
  createEventDecl,
  flagIssueToAdminDecl,
]

type ToolArgs = Record<string, unknown>

/**
 * Step 1 — Propose an action.
 *
 * For most tools this returns `{ requiresConfirmation: true, pendingAction }`.
 * The pending action is stored in memory for 5 minutes.
 *
 * For `flagIssueToAdmin` this executes immediately and returns
 * `{ requiresConfirmation: false, result }`.
 */
export async function executeActionTool(
  toolName: string,
  args:     ToolArgs,
  caller:   CallerContext,
): Promise<ActionResult> {
  try {
    switch (toolName) {
      case 'restoreFileFromTrash':
        return await proposeRestoreFile(args as Parameters<typeof proposeRestoreFile>[0], caller)
      case 'resetUserPassword':
        return await proposeResetPassword(args as Parameters<typeof proposeResetPassword>[0], caller)
      case 'unlockUserAccount':
        return await proposeUnlockAccount(args as Parameters<typeof proposeUnlockAccount>[0], caller)
      case 'changeFileStatus':
        return await proposeChangeStatus(args as Parameters<typeof proposeChangeStatus>[0], caller)
      case 'createEvent':
        return await proposeCreateEvent(args as Parameters<typeof proposeCreateEvent>[0], caller)
      case 'flagIssueToAdmin':
        return await executeFlagIssue(args as Parameters<typeof executeFlagIssue>[0], caller)
      default:
        return { requiresConfirmation: false, error: `Unknown action tool: "${toolName}".` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[action-tools] ${toolName} propose failed:`, msg)
    return { requiresConfirmation: false, error: 'Something went wrong preparing that action. Please try again.' }
  }
}

/**
 * Step 2 — Execute a confirmed action.
 *
 * Called by /api/assistant/confirm once the user clicks "Yes".
 * Pops the pending action from memory (consuming it), then runs the real DB writes.
 */
export async function executePendingAction(
  actionId: string,
  caller:   CallerContext,
): Promise<ActionResult> {
  const pending = popPendingAction(actionId)

  if (!pending) {
    return {
      requiresConfirmation: false,
      error: 'That confirmation has expired or already been used. Please ask me again if you still want to do this.',
    }
  }

  // Security: confirm that the same user is confirming
  if (pending.userId !== caller.userId) {
    return { requiresConfirmation: false, error: 'You cannot confirm an action requested by a different user.' }
  }

  const confirmedAt = new Date()

  // Create ZaraActionLog entry and take pre-action snapshot BEFORE executing
  let logId: string | null = null
  let preSnapshot: Record<string, unknown> | null = null
  try {
    logId = await createAndSnapshotLog(pending.toolName, pending.args, caller, confirmedAt)
  } catch (snapErr) {
    // Snapshot failure must never block the action itself
    console.warn('[action-tools] ZaraActionLog creation failed (non-blocking):', snapErr)
  }

  try {
    let execResult: ActionResult
    switch (pending.toolName) {
      case 'restoreFileFromTrash':
        execResult = await executeRestoreFile(pending.args as Parameters<typeof executeRestoreFile>[0], caller)
        break
      case 'resetUserPassword':
        execResult = await executeResetPassword(pending.args as Parameters<typeof executeResetPassword>[0], caller)
        break
      case 'unlockUserAccount':
        execResult = await executeUnlockAccount(pending.args as Parameters<typeof executeUnlockAccount>[0], caller)
        break
      case 'changeFileStatus':
        execResult = await executeChangeStatus(pending.args as Parameters<typeof executeChangeStatus>[0], caller)
        break
      case 'createEvent':
        execResult = await executeCreateEvent(pending.args as Parameters<typeof executeCreateEvent>[0], caller)
        break
      default:
        execResult = { requiresConfirmation: false, error: `Unknown pending tool: "${pending.toolName}".` }
    }

    // Update preservation log with result
    if (logId) {
      const resultStr = 'result' in execResult ? execResult.result : undefined
      completeActionLog(logId, pending.toolName, pending.args, resultStr, preSnapshot).catch(
        (e: unknown) => console.warn('[action-tools] completeActionLog failed:', e),
      )
    }

    // Record in telemetry — only on success
    if ('result' in execResult && execResult.result) {
      recordActionExecuted(
        pending.toolName,
        caller.userId,
        caller.userName,
        execResult.result.slice(0, 200),
      )
    }

    return execResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[action-tools] ${pending.toolName} execute failed:`, msg)
    if (logId) {
      failActionLog(logId, msg).catch(() => {})
    }
    return { requiresConfirmation: false, error: 'The action failed unexpectedly. Please try again or check the system manually.' }
  }
}
