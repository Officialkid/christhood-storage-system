import { prisma } from './prisma'

// ─────────────────────────────────────────────────────────────────────────────
// All recognised action strings
// ─────────────────────────────────────────────────────────────────────────────
export type LogAction =
  // Media lifecycle
  | 'FILE_UPLOADED'
  | 'FILE_DOWNLOADED'
  | 'FILE_DELETED'
  | 'FILE_RESTORED'
  | 'FILE_ARCHIVED'
  | 'FILE_UNARCHIVED'
  | 'STATUS_CHANGED'
  | 'BATCH_DOWNLOADED'
  | 'VERSION_UPLOADED'
  | 'VERSION_RESTORED'
  | 'TAG_CHANGED'
  // Admin
  | 'SETTINGS_CHANGED'
  // Folder / hierarchy
  | 'FOLDER_CREATED'
  | 'YEAR_CREATED'
  | 'YEAR_DELETED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_DELETED'
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'
  | 'SUBFOLDER_CREATED'
  | 'SUBFOLDER_UPDATED'
  | 'SUBFOLDER_DELETED'
  // Users / auth
  | 'USER_CREATED'
  | 'USER_LOGIN'
  | 'USER_LOGIN_SUCCESS'
  | 'USER_LOGIN_FAILED'
  | 'USER_UNLOCKED'
  | 'ROLE_CHANGED'
  // File Transfer system
  | 'TRANSFER_SENT'
  | 'TRANSFER_DOWNLOADED'
  | 'TRANSFER_RESPONDED'
  | 'TRANSFER_RESPONSE_DOWNLOADED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'TRANSFER_PURGED'
  | 'TRANSFER_INTEGRITY_FAILURE'
  // Internal messaging
  | 'MESSAGE_SENT'
  // External share links
  | 'SHARE_LINK_CREATED'
  | 'SHARE_LINK_REVOKED'
  // Legacy aliases (kept for backward compat)
  | 'MEDIA_UPLOADED'
  | 'MEDIA_DOWNLOADED'

/** @deprecated Use LogAction directly */
export type HierarchyAction = LogAction

// ─────────────────────────────────────────────────────────────────────────────
// Typed metadata shapes (documentation — not enforced at runtime)
// ─────────────────────────────────────────────────────────────────────────────
export interface FileUploadedMeta    { fileName: string; storedName?: string; fileType?: string; fileSize?: number; mode?: string }
export interface FileDownloadedMeta  { fileName: string }
export interface FileDeletedMeta     { fileName: string; eventId?: string }
export interface FileArchivedMeta    { fileName: string; previousStatus: string; auto?: boolean }
export interface FileUnarchivedMeta  { fileName: string; restoredStatus: string }
export interface StatusChangedMeta   { oldStatus: string; newStatus: string; fileName?: string }
export interface SettingsChangedMeta { key: string; oldValue: string; newValue: string }
export interface VersionUploadedMeta { fileName: string; versionNumber: number; r2Key: string }
export interface VersionRestoredMeta { fileName: string; fromVersion: number; newVersionNumber: number }
export interface TagChangedMeta      { tagIds: string[]; tagNames: string[]; fileName?: string; eventName?: string; target?: 'file' | 'event' }
export interface FolderCreatedMeta   { folderType: 'year' | 'category' | 'event' | 'subfolder'; folderName: string }
export interface UserCreatedMeta     { newUserId: string; role: string; email?: string }
export interface UserLoginMeta       { ipAddress?: string; userAgent?: string }
export interface RoleChangedMeta     { targetUserId: string; oldRole: string; newRole: string }
export interface UserLoginSuccessMeta { identifier: string; ip?: string }
export interface UserLoginFailedMeta  { reason: 'WRONG_PASSWORD' | 'ACCOUNT_LOCKED'; identifier: string; ip?: string; attempt?: number; locked?: boolean }
export interface UserUnlockedMeta     { unlockedUserId: string; unlockedEmail?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Core log function
// ─────────────────────────────────────────────────────────────────────────────
export interface LogOptions {
  metadata?:   Record<string, unknown>
  eventId?:    string | null
  mediaFileId?: string | null
}

/**
 * Write a single row to ActivityLog.
 * Always non-fatal: catches internally and prints a warning instead of throwing.
 */
export async function log(
  action:  LogAction | (string & {}),   // string & {} allows arbitrary strings while still hinting known ones
  userId:  string,
  opts:    LogOptions = {},
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action,
        userId,
        eventId:     opts.eventId     ?? undefined,
        mediaFileId: opts.mediaFileId  ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata:    opts.metadata as any,
      },
    })
  } catch (err) {
    console.warn('[activityLog] failed to write log entry:', action, err)
  }
}

/**
 * Legacy signature — kept so all existing hierarchy API routes don't need changes.
 * Calls through to `log()` with the same semantics.
 */
export async function logActivity(
  action:    LogAction | (string & {}),
  userId:    string,
  metadata?: Record<string, unknown>,
  eventId?:  string | null,
): Promise<void> {
  return log(action, userId, { metadata, eventId })
}

