import { prisma }        from './prisma'
import type { AppRole }  from '@/types'

/** The minimal shape we need from a MediaFile to authorise access. */
export interface FileAccessInfo {
  id:         string
  r2Key:      string
  storedName: string
  originalName: string
  eventId:    string
  uploaderId: string
}

export type AccessDenied = { allowed: false; reason: string }
export type AccessGranted = { allowed: true;  file: FileAccessInfo }
export type AccessResult  = AccessGranted | AccessDenied

/**
 * Determine whether `userId` (with `role`) may download `fileId`.
 *
 * Rules:
 *  - ADMIN  → any file
 *  - EDITOR → any file
 *  - UPLOADER → only files they personally uploaded
 */
export async function canDownloadFile(
  userId:  string,
  role:    AppRole,
  fileId:  string,
): Promise<AccessResult> {
  const file = await prisma.mediaFile.findUnique({
    where:  { id: fileId },
    select: {
      id:           true,
      r2Key:        true,
      storedName:   true,
      originalName: true,
      eventId:      true,
      uploaderId:   true,
    },
  })

  if (!file) return { allowed: false, reason: 'File not found' }

  if (role === 'ADMIN' || role === 'EDITOR') {
    return { allowed: true, file }
  }

  // UPLOADER: only own uploads
  if (file.uploaderId !== userId) {
    return { allowed: false, reason: 'You can only download files you uploaded' }
  }
  return { allowed: true, file }
}

/**
 * Determine whether `userId` (with `role`) may batch-download an event/subfolder.
 * Only ADMIN and EDITOR may use batch download.
 */
export function canBatchDownload(role: AppRole): boolean {
  return role === 'ADMIN' || role === 'EDITOR'
}
