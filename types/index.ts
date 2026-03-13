// ─── Enums (mirror Prisma schema) ───────────────────────────────────────────

export type AppRole = 'ADMIN' | 'UPLOADER' | 'EDITOR'

export type FileType = 'PHOTO' | 'VIDEO'

export type FileStatus =
  | 'RAW'
  | 'EDITING_IN_PROGRESS'
  | 'EDITED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'DELETED'
  | 'PURGED'

// ─── Tag ──────────────────────────────────────────────────────────────────────

export interface TagItem {
  id:        string
  name:      string
  createdAt: string
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface YearItem {
  id: string
  year: number
  createdAt: string
}

export interface EventCategoryItem {
  id: string
  name: string
  yearId: string
}

export interface EventItem {
  id: string
  name: string
  date: string
  categoryId: string
  createdAt: string
  category?: EventCategoryItem
}

export interface EventSubfolderItem {
  id: string
  label: string
  eventId: string
}

export interface MediaFile {
  id: string
  originalName: string
  storedName: string
  r2Key: string
  fileType: FileType
  fileSize: number
  status: FileStatus
  uploaderId: string
  eventId: string
  subfolderId: string | null
  thumbnailKey: string | null
  createdAt: string
  updatedAt: string
  uploader?: { id: string; username: string; email: string }
  event?: EventItem
  subfolder?: EventSubfolderItem | null
  tags?: TagItem[]
}

export interface FileVersionItem {
  id: string
  mediaFileId: string
  versionNumber: number
  r2Key: string
  uploadedById: string
  createdAt: string
  uploadedBy?: { id: string; username: string | null; email: string }
  downloadUrl?: string
}

export interface ActivityLogItem {
  id: string
  action: string
  userId: string
  mediaFileId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface TrashItem {
  id: string
  mediaFileId: string
  deletedById: string
  deletedAt: string
  scheduledPurgeAt: string
  restored: boolean
}

// ─── Hierarchy tree (API response shapes) ────────────────────────────────────

export interface HierarchySubfolder {
  id:      string
  label:   string
  eventId: string
  _count?: { mediaFiles: number }
}

export interface HierarchyEvent {
  id:         string
  name:       string
  date:       string
  categoryId: string
  createdAt:  string
  subfolders: HierarchySubfolder[]
  _count?:    { mediaFiles: number }
}

export interface HierarchyCategory {
  id:         string
  name:       string
  yearId:     string
  isDefault:  boolean
  isArchived: boolean
  events:     HierarchyEvent[]
}

export interface HierarchyYear {
  id:         string
  year:       number
  createdAt:  string
  categories: HierarchyCategory[]
}

// ─── API response helpers ─────────────────────────────────────────────────────

export interface PresignedUploadResponse {
  uploadUrl: string
  r2Key: string
}
