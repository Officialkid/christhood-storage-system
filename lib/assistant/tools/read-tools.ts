// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/tools/read-tools.ts
//
// All 9 read-only Gemini function-calling tools for Zara.
//
// Each tool is two things:
//   1. A FunctionDeclaration — tells Gemini when / how to call it.
//   2. An implementation function — queries Prisma and returns plain objects.
//
// Role enforcement is applied inside every implementation:
//   UPLOADER  → restricted to events they follow (FolderFollow)
//   EDITOR    → full media access; no user account details for others
//   ADMIN     → unrestricted
//
// Security contract:
//   - passwordHash, VAPID keys, R2 secrets NEVER returned
//   - Email addresses of OTHER users are redacted for non-admins
//   - Functions NEVER throw — always return a safe object on error/empty
//   - All queries use .take(limit) to bound execution time
// ─────────────────────────────────────────────────────────────────────────────

import { FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { prisma }  from '@/lib/prisma'
import { filterTransferActivityForViewer } from '@/lib/transferActivityPrivacy'
import type { AppRole } from '@/types'

// ── Caller context passed to every tool implementation ───────────────────────
export interface CallerContext {
  userId:   string
  userName: string
  role:     AppRole
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Cap at 20 — prevents very expensive queries from a single chat message. */
function safeLimit(raw: unknown, defaultVal = 10): number {
  const n = typeof raw === 'number' ? Math.round(raw) : defaultVal
  return Math.min(Math.max(1, n), 20)
}

/** Formats bytes into a human-readable string. */
function fmtBytes(bytes: bigint): string {
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Returns the event IDs accessible to an UPLOADER based on FolderFollow. */
async function getUploaderEventIds(userId: string): Promise<string[]> {
  const follows = await prisma.folderFollow.findMany({
    where:  { userId },
    select: { eventId: true },
  })
  return follows.map(f => f.eventId)
}

/** Redact email for non-admin callers viewing another user's details. */
function maybeRedactEmail(email: string | null, callerRole: AppRole, targetUserId: string, callerUserId: string): string {
  if (callerRole === 'ADMIN') return email ?? '—'
  if (callerUserId === targetUserId) return email ?? '—'
  return '(hidden)'
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1 — searchFiles
// ─────────────────────────────────────────────────────────────────────────────

const searchFilesDecl: FunctionDeclaration = {
  name: 'searchFiles',
  description:
    'Search for files in the CMMS by any combination of: event name, date, uploader name, ' +
    'file type (PHOTO/VIDEO), file status, or tags. Use this when the user is looking for ' +
    'specific files, wants to know what content exists, or asks questions like ' +
    '"find the video James uploaded last Sunday" or "what photos were taken at the mission?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: 'Keyword to search in file names and event names. Omit to search all files.',
      },
      eventName: {
        type: SchemaType.STRING,
        description: 'Filter by event name (partial match ok). Omit if not specified.',
      },
      uploaderName: {
        type: SchemaType.STRING,
        description: "Filter by the uploader's name or username. Omit if not specified.",
      },
      fileType: {
        type: SchemaType.STRING,
        enum: ['PHOTO', 'VIDEO'],
        description: 'Filter by file type. Omit to return both photos and videos.',
      },
      status: {
        type: SchemaType.STRING,
        enum: ['RAW', 'EDITING_IN_PROGRESS', 'EDITED', 'PUBLISHED', 'ARCHIVED'],
        description: 'Filter by file status. Omit to return all statuses.',
      },
      dateFrom: {
        type: SchemaType.STRING,
        description: 'ISO date string (YYYY-MM-DD). Only return files uploaded on or after this date.',
      },
      dateTo: {
        type: SchemaType.STRING,
        description: 'ISO date string (YYYY-MM-DD). Only return files uploaded on or before this date.',
      },
      limit: {
        type: SchemaType.NUMBER,
        description: 'Max results to return. Default 10, max 20.',
      },
    },
    required: [],
  },
}

async function searchFiles(
  args: {
    query?:        string
    eventName?:    string
    uploaderName?: string
    fileType?:     'PHOTO' | 'VIDEO'
    status?:       string
    dateFrom?:     string
    dateTo?:       string
    limit?:        number
  },
  caller: CallerContext,
) {
  const limit = safeLimit(args.limit)

  // Build event-scope restriction for UPLOADERs
  let allowedEventIds: string[] | null = null
  if (caller.role === 'UPLOADER') {
    allowedEventIds = await getUploaderEventIds(caller.userId)
    if (allowedEventIds.length === 0) {
      return { found: 0, files: [], message: "You haven't been assigned to any events yet." }
    }
  }

  const files = await prisma.mediaFile.findMany({
    where: {
      // DELETED / PURGED never shown
      status: { notIn: ['DELETED', 'PURGED'] },
      // UPLOADER scope
      ...(allowedEventIds ? { eventId: { in: allowedEventIds } } : {}),
      // Keyword search across file names
      ...(args.query ? {
        OR: [
          { originalName: { contains: args.query, mode: 'insensitive' } },
          { event: { name: { contains: args.query, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(args.eventName ? {
        event: { name: { contains: args.eventName, mode: 'insensitive' } },
      } : {}),
      ...(args.uploaderName ? {
        uploader: {
          OR: [
            { name:     { contains: args.uploaderName, mode: 'insensitive' } },
            { username: { contains: args.uploaderName, mode: 'insensitive' } },
          ],
        },
      } : {}),
      ...(args.fileType ? { fileType: args.fileType } : {}),
      ...(args.status ? { status: args.status as never } : {}),
      ...(args.dateFrom || args.dateTo ? {
        createdAt: {
          ...(args.dateFrom ? { gte: new Date(args.dateFrom) } : {}),
          ...(args.dateTo   ? { lte: new Date(args.dateTo + 'T23:59:59Z') } : {}),
        },
      } : {}),
    },
    include: {
      uploader: { select: { name: true, username: true } },
      event: {
        include: {
          category: { include: { year: true } },
        },
      },
      versions: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })

  if (files.length === 0) {
    return { found: 0, files: [], message: 'No files matched your search.' }
  }

  return {
    found: files.length,
    files: files.map(f => ({
      id:           f.id,
      fileName:     f.originalName,
      eventName:    f.event.name,
      categoryName: f.event.category.name,
      year:         f.event.category.year.year,
      uploaderName: f.uploader.username ?? f.uploader.name ?? 'Unknown',
      uploadedAt:   f.createdAt.toISOString(),
      status:       f.status,
      fileType:     f.fileType,
      fileSize:     fmtBytes(f.fileSize),
      versionCount: f.versions.length,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2 — getEventContents
// ─────────────────────────────────────────────────────────────────────────────

const getEventContentsDecl: FunctionDeclaration = {
  name: 'getEventContents',
  description:
    'Get all files inside a specific event or subfolder. Use this when the user asks ' +
    '"what is in the School A Mission event?" or "how many photos were uploaded for the ' +
    'Saturday fellowship?" or wants a breakdown of an event\'s content.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      eventName: {
        type: SchemaType.STRING,
        description: 'The event name to look up (partial match ok, e.g. "School A" or "Saturday Fellowship").',
      },
      subfolder: {
        type: SchemaType.STRING,
        description: 'Optional subfolder label, e.g. "Friday", "Saturday", "Sunday". Omit to get all subfolders.',
      },
      year: {
        type: SchemaType.NUMBER,
        description: 'The year to search in. Defaults to the current year if omitted.',
      },
    },
    required: ['eventName'],
  },
}

async function getEventContents(
  args: { eventName: string; subfolder?: string; year?: number },
  caller: CallerContext,
) {
  const targetYear = args.year ?? new Date().getFullYear()

  const event = await prisma.event.findFirst({
    where: {
      name: { contains: args.eventName, mode: 'insensitive' },
      category: { year: { year: targetYear } },
    },
    include: {
      category: { include: { year: true } },
      subfolders: true,
    },
  })

  if (!event) {
    return {
      found: false,
      message: `No event matching "${args.eventName}" found in ${targetYear}. Try a different year or check the spelling.`,
    }
  }

  // UPLOADER: verify they follow this event
  if (caller.role === 'UPLOADER') {
    const follows = await prisma.folderFollow.findFirst({
      where: { userId: caller.userId, eventId: event.id },
    })
    if (!follows) {
      return {
        found:   false,
        message: "You don't have access to that event. Contact your admin if you think this is a mistake.",
      }
    }
  }

  // Build subfolder filter
  const subfolderIds = args.subfolder
    ? event.subfolders
        .filter(s => s.label.toLowerCase().includes(args.subfolder!.toLowerCase()))
        .map(s => s.id)
    : undefined

  const files = await prisma.mediaFile.findMany({
    where: {
      eventId: event.id,
      status:  { notIn: ['DELETED', 'PURGED'] },
      ...(subfolderIds ? { subfolderId: { in: subfolderIds } } : {}),
    },
    include: {
      uploader:  { select: { name: true, username: true } },
      subfolder: { select: { label: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    20,
  })

  const statusBreakdown = {
    raw:              files.filter(f => f.status === 'RAW').length,
    editingInProgress: files.filter(f => f.status === 'EDITING_IN_PROGRESS').length,
    edited:           files.filter(f => f.status === 'EDITED').length,
    published:        files.filter(f => f.status === 'PUBLISHED').length,
    archived:         files.filter(f => f.status === 'ARCHIVED').length,
  }

  return {
    eventName:       event.name,
    categoryName:    event.category.name,
    year:            event.category.year.year,
    totalFiles:      files.length,
    totalPhotos:     files.filter(f => f.fileType === 'PHOTO').length,
    totalVideos:     files.filter(f => f.fileType === 'VIDEO').length,
    statusBreakdown,
    files: files.slice(0, 20).map(f => ({
      id:           f.id,
      fileName:     f.originalName,
      status:       f.status,
      fileType:     f.fileType,
      uploaderName: f.uploader.username ?? f.uploader.name ?? 'Unknown',
      uploadedAt:   f.createdAt.toISOString(),
      subfolder:    f.subfolder?.label ?? null,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3 — getUserActivity
// ─────────────────────────────────────────────────────────────────────────────

const getUserActivityDecl: FunctionDeclaration = {
  name: 'getUserActivity',
  description:
    'Look up what a specific user has done recently in the CMMS — uploads, downloads, ' +
    'status changes. Use this when the user asks about their own activity ("what have I " + ' +
    '"uploaded this week?") or when an admin asks about a specific team member ' +
    '("what has James been doing?"). Non-admins can only look up their own activity.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      userName: {
        type: SchemaType.STRING,
        description: "The name or username to look up. If the user is asking about themselves, use their own name.",
      },
      actionTypes: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: 'Optional filter by action type(s), e.g. ["FILE_UPLOADED", "FILE_DOWNLOADED"].',
      },
      limit: {
        type: SchemaType.NUMBER,
        description: 'Max results to return. Default 10, max 20.',
      },
      dateFrom: {
        type: SchemaType.STRING,
        description: 'ISO date string. Only show activity from this date onwards.',
      },
    },
    required: ['userName'],
  },
}

async function getUserActivity(
  args: { userName: string; actionTypes?: string[]; limit?: number; dateFrom?: string },
  caller: CallerContext,
) {
  const limit = safeLimit(args.limit)

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name:     { contains: args.userName, mode: 'insensitive' } },
        { username: { contains: args.userName, mode: 'insensitive' } },
      ],
    },
    select: {
      id:                  true,
      name:                true,
      username:            true,
      role:                true,
      activityLogs:        { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  if (!user) {
    return { found: false, message: `No user found matching "${args.userName}".` }
  }

  // Non-admins can only query their own activity
  if (caller.role !== 'ADMIN' && user.id !== caller.userId) {
    return {
      found:   false,
      message: "You can only look up your own activity. Admins can look up any team member.",
    }
  }

  const logsRaw = await prisma.activityLog.findMany({
    where: {
      userId: user.id,
      ...(args.actionTypes?.length ? { action: { in: args.actionTypes } } : {}),
      ...(args.dateFrom ? { createdAt: { gte: new Date(args.dateFrom) } } : {}),
    },
    include: {
      mediaFile: { select: { id: true, originalName: true, event: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })

  const logs = await filterTransferActivityForViewer(logsRaw, caller.userId)

  const lastActive = user.activityLogs[0]?.createdAt?.toISOString() ?? null

  return {
    user: {
      name:       user.name ?? user.username ?? 'Unknown',
      username:   user.username ?? '—',
      role:       user.role,
      lastActive,
    },
    totalActions: logs.length,
    activity: logs.map(l => ({
      action:      l.action,
      description: (l.metadata as { description?: string } | null)?.description ?? l.action,
      timestamp:   l.createdAt.toISOString(),
      fileId:      l.mediaFile?.id ?? null,
      fileName:    l.mediaFile?.originalName ?? null,
      eventName:   l.mediaFile?.event?.name ?? null,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 4 — getFileDetails
// ─────────────────────────────────────────────────────────────────────────────

const getFileDetailsDecl: FunctionDeclaration = {
  name: 'getFileDetails',
  description:
    'Get complete details about a specific file: its version history, who downloaded it, ' +
    'current status, tags, and uploader. Use this when the user asks about a specific file ' +
    'by name or ID, e.g. "what is the status of Missions_20260308_001.mp4?" or ' +
    '"who has downloaded that video?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fileId: {
        type: SchemaType.STRING,
        description: 'The exact file ID (cuid) if known from a previous searchFiles call.',
      },
      fileName: {
        type: SchemaType.STRING,
        description: 'File name (partial match ok) if the ID is not known.',
      },
    },
    required: [],
  },
}

async function getFileDetails(
  args: { fileId?: string; fileName?: string },
  caller: CallerContext,
) {
  if (!args.fileId && !args.fileName) {
    return { found: false, message: 'Please provide a file name or ID to look up.' }
  }

  const file = await prisma.mediaFile.findFirst({
    where: {
      status: { notIn: ['DELETED', 'PURGED'] },
      ...(args.fileId ? { id: args.fileId } : {}),
      ...(args.fileName ? {
        originalName: { contains: args.fileName, mode: 'insensitive' },
      } : {}),
    },
    include: {
      uploader: { select: { name: true, username: true } },
      event: {
        include: {
          category: { include: { year: true } },
        },
      },
      versions: {
        include: { uploadedBy: { select: { name: true, username: true } } },
        orderBy: { versionNumber: 'desc' },
      },
      tags: { select: { name: true } },
      activityLogs: {
        where:   { action: { in: ['FILE_DOWNLOADED', 'BATCH_DOWNLOADED'] } },
        include: { user: { select: { name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take:    1,
      },
    },
  })

  if (!file) {
    return { found: false, message: `No file found matching "${args.fileName ?? args.fileId}".` }
  }

  // UPLOADER: must follow this event
  if (caller.role === 'UPLOADER') {
    const follows = await prisma.folderFollow.findFirst({
      where: { userId: caller.userId, eventId: file.eventId },
    })
    if (!follows) {
      return { found: false, message: "You don't have access to that file." }
    }
  }

  const lastDownload = file.activityLogs[0]

  return {
    found:              true,
    id:                 file.id,
    originalName:       file.originalName,
    storedName:         file.storedName,
    status:             file.status,
    fileType:           file.fileType,
    fileSize:           fmtBytes(file.fileSize),
    uploaderName:       file.uploader.username ?? file.uploader.name ?? 'Unknown',
    uploadedAt:         file.createdAt.toISOString(),
    eventName:          file.event.name,
    categoryName:       file.event.category.name,
    year:               file.event.category.year.year,
    versions:           file.versions.map(v => ({
      versionNumber: v.versionNumber,
      uploadedBy:    v.uploadedBy.username ?? v.uploadedBy.name ?? 'Unknown',
      uploadedAt:    v.createdAt.toISOString(),
    })),
    currentVersion:     file.versions[0]?.versionNumber ?? 1,
    downloadCount:      file.activityLogs.length,
    lastDownloadedBy:   lastDownload?.user
      ? (lastDownload.user.username ?? lastDownload.user.name ?? 'Unknown')
      : null,
    lastDownloadedAt:   lastDownload?.createdAt.toISOString() ?? null,
    tags:               file.tags.map(t => t.name),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 5 — getRecentActivity
// ─────────────────────────────────────────────────────────────────────────────

const getRecentActivityDecl: FunctionDeclaration = {
  name: 'getRecentActivity',
  description:
    'Get a summary of recent activity across the whole CMMS system, optionally filtered ' +
    'by action type or user. Use when an admin asks "what has been happening in the system?" ' +
    'or "were there any uploads today?" or "has anyone been downloading files recently?". ' +
    'Only available to ADMIN and EDITOR roles — UPLOADERs see only their own activity.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      limit: {
        type: SchemaType.NUMBER,
        description: 'Max log entries to return. Default 15, max 20.',
      },
      actionType: {
        type: SchemaType.STRING,
        description: 'Filter to a single action type, e.g. "FILE_UPLOADED" or "FILE_DOWNLOADED".',
      },
      userName: {
        type: SchemaType.STRING,
        description: 'Filter by a specific user name or username. Omit for all users.',
      },
      dateFrom: {
        type: SchemaType.STRING,
        description: 'ISO date string. Only return entries from this date onwards.',
      },
    },
    required: [],
  },
}

async function getRecentActivity(
  args: { limit?: number; actionType?: string; userName?: string; dateFrom?: string },
  caller: CallerContext,
) {
  const limit = safeLimit(args.limit, 15)

  // UPLOADERs only get their own activity via getUserActivity — redirect them
  if (caller.role === 'UPLOADER') {
    return {
      restricted: true,
      message:    'Use getUserActivity to look up your own activity.',
    }
  }

  // Resolve optional userName to userId filter
  let filterUserId: string | undefined
  if (args.userName) {
    const u = await prisma.user.findFirst({
      where: {
        OR: [
          { name:     { contains: args.userName, mode: 'insensitive' } },
          { username: { contains: args.userName, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (!u) return { totalEntries: 0, entries: [], message: `No user found matching "${args.userName}".` }
    filterUserId = u.id
  }

  const logsRaw = await prisma.activityLog.findMany({
    where: {
      ...(filterUserId ? { userId: filterUserId } : {}),
      ...(args.actionType ? { action: args.actionType } : {}),
      ...(args.dateFrom ? { createdAt: { gte: new Date(args.dateFrom) } } : {}),
    },
    include: {
      user:      { select: { name: true, username: true } },
      mediaFile: { select: { id: true, originalName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })

  const logs = await filterTransferActivityForViewer(logsRaw, caller.userId)

  return {
    totalEntries: logs.length,
    entries: logs.map(l => ({
      action:      l.action,
      userName:    l.user?.username ?? l.user?.name ?? 'Unknown',
      description: (l.metadata as { description?: string } | null)?.description ?? l.action,
      timestamp:   l.createdAt.toISOString(),
      fileId:      l.mediaFile?.id ?? null,
      fileName:    l.mediaFile?.originalName ?? null,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 6 — getStorageStats
// ─────────────────────────────────────────────────────────────────────────────

const getStorageStatsDecl: FunctionDeclaration = {
  name: 'getStorageStats',
  description:
    'Get current storage usage statistics for the entire CMMS — total files, photos vs videos, ' +
    'status breakdown, trash count, and recent upload counts. Use when someone asks "how much ' +
    'content do we have?" or "how many files were uploaded this week?" or "is storage running low?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
    required: [],
  },
}

async function getStorageStats(_args: Record<string, never>, caller: CallerContext) {
  // UPLOADERs and EDITORs see system-wide counts (no sensitive detail)
  const now       = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart  = new Date(now); weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalFiles, totalPhotos, totalVideos,
    rawCount, editingCount, editedCount, publishedCount, archivedCount,
    trashFiles,
    uploadsToday, uploadsWeek, uploadsMonth,
  ] = await Promise.all([
    prisma.mediaFile.count({ where: { status: { notIn: ['DELETED', 'PURGED'] } } }),
    prisma.mediaFile.count({ where: { fileType: 'PHOTO', status: { notIn: ['DELETED', 'PURGED'] } } }),
    prisma.mediaFile.count({ where: { fileType: 'VIDEO', status: { notIn: ['DELETED', 'PURGED'] } } }),
    prisma.mediaFile.count({ where: { status: 'RAW' } }),
    prisma.mediaFile.count({ where: { status: 'EDITING_IN_PROGRESS' } }),
    prisma.mediaFile.count({ where: { status: 'EDITED' } }),
    prisma.mediaFile.count({ where: { status: 'PUBLISHED' } }),
    prisma.mediaFile.count({ where: { status: 'ARCHIVED' } }),
    prisma.trashItem.count(),
    prisma.mediaFile.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.mediaFile.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.mediaFile.count({ where: { createdAt: { gte: monthStart } } }),
  ])

  return {
    totalFiles,
    totalPhotos,
    totalVideos,
    statusBreakdown: {
      raw:              rawCount,
      editing:          editingCount,
      edited:           editedCount,
      published:        publishedCount,
      archived:         archivedCount,
    },
    trashFiles,
    recentUploads: {
      today:     uploadsToday,
      thisWeek:  uploadsWeek,
      thisMonth: uploadsMonth,
    },
    note: 'Storage byte totals require the Cloudflare R2 API and are not available here. File counts are exact.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 7 — getTrashContents
// ─────────────────────────────────────────────────────────────────────────────

const getTrashContentsDecl: FunctionDeclaration = {
  name: 'getTrashContents',
  description:
    'See what files are currently in the trash and when they will be permanently deleted. ' +
    'Use when a user says a file is missing (it may have been deleted), or when an admin ' +
    'wants to review the trash. Only ADMIN users can see who deleted a file.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      limit: {
        type: SchemaType.NUMBER,
        description: 'Max files to return. Default 10, max 20.',
      },
    },
    required: [],
  },
}

async function getTrashContents(
  args: { limit?: number },
  caller: CallerContext,
) {
  const limit = safeLimit(args.limit)

  const trashItems = await prisma.trashItem.findMany({
    include: {
      mediaFile: {
        include: {
          event:    { include: { category: { include: { year: true } } } },
          uploader: { select: { name: true, username: true } },
        },
      },
      deletedBy: { select: { name: true, username: true } },
    },
    orderBy: { scheduledPurgeAt: 'asc' },  // soonest to be purged first
    take:    limit,
  })

  if (trashItems.length === 0) {
    return { totalInTrash: 0, files: [], message: 'The trash is empty.' }
  }

  const now = Date.now()

  return {
    totalInTrash: trashItems.length,
    files: trashItems.map(t => {
      const msRemaining = t.scheduledPurgeAt.getTime() - now
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
      return {
        id:           t.mediaFile.id,
        fileName:     t.mediaFile.originalName,
        eventName:    t.mediaFile.event.name,
        // deletedBy only shown to admins
        deletedBy:    caller.role === 'ADMIN'
          ? (t.deletedBy.username ?? t.deletedBy.name ?? 'Unknown')
          : '(admin)',
        deletedAt:    t.deletedAt.toISOString(),
        purgesAt:     t.scheduledPurgeAt.toISOString(),
        daysRemaining,
        canRestore:   daysRemaining > 0,
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 8 — findUser
// ─────────────────────────────────────────────────────────────────────────────

const findUserDecl: FunctionDeclaration = {
  name: 'findUser',
  description:
    'Look up a user\'s account details, role, and status. Use when an admin asks about a ' +
    'team member\'s account ("is James an uploader or editor?"), when diagnosing login or ' +
    'access problems ("why can\'t Sarah log in?"), or to check if an account is locked. ' +
    'ONLY available to ADMIN users — non-admins cannot look up other users\' accounts.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      nameOrEmail: {
        type: SchemaType.STRING,
        description: 'Search by name, username, or email address.',
      },
    },
    required: ['nameOrEmail'],
  },
}

async function findUser(
  args: { nameOrEmail: string },
  caller: CallerContext,
) {
  // Only ADMINs may use this tool
  if (caller.role !== 'ADMIN') {
    return {
      found:   false,
      message: 'Account lookup is only available to admins. You can view your own profile in Settings.',
    }
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name:     { contains: args.nameOrEmail, mode: 'insensitive' } },
        { username: { contains: args.nameOrEmail, mode: 'insensitive' } },
        { email:    { contains: args.nameOrEmail, mode: 'insensitive' } },
      ],
    },
    include: {
      folderFollows: { include: { event: { select: { name: true } } } },
      activityLogs:  { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  if (!user) {
    return { found: false, message: `No user found matching "${args.nameOrEmail}".` }
  }

  const isLocked = !!(user.lockedUntil && user.lockedUntil > new Date())

  return {
    found:               true,
    id:                  user.id,
    name:                user.name ?? '—',
    username:            user.username ?? '—',
    email:               user.email,           // ADMIN-only tool — email shown in full
    role:                user.role,
    createdAt:           user.createdAt.toISOString(),
    lastLogin:           user.activityLogs[0]?.createdAt.toISOString() ?? null,
    isLocked,
    lockedUntil:         user.lockedUntil?.toISOString() ?? null,
    failedLoginAttempts: user.failedLoginAttempts,
    assignedEvents:      user.folderFollows.map(ff => ff.event.name),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 9 — getTransferStatus
// ─────────────────────────────────────────────────────────────────────────────

const getTransferStatusDecl: FunctionDeclaration = {
  name: 'getTransferStatus',
  description:
    'Check the status of a file transfer — whether files were sent, downloaded by the ' +
    'recipient, responded to, or completed. Use when a user asks "has the editor downloaded ' +
    'the files I sent?" or "what happened to that transfer?" or "I haven\'t received any ' +
    'files to edit". UPLOADERs cannot view transfers — only ADMINs and EDITORs.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      transferId: {
        type: SchemaType.STRING,
        description: 'The exact transfer ID if known.',
      },
      senderName: {
        type: SchemaType.STRING,
        description: 'Filter by sender name or username.',
      },
      recipientName: {
        type: SchemaType.STRING,
        description: 'Filter by recipient name or username.',
      },
      status: {
        type: SchemaType.STRING,
        enum: ['PENDING', 'DOWNLOADED', 'RESPONDED', 'COMPLETED'],
        description: 'Filter by transfer status.',
      },
      limit: {
        type: SchemaType.NUMBER,
        description: 'Max results. Default 5, max 20.',
      },
    },
    required: [],
  },
}

async function getTransferStatus(
  args: {
    transferId?:    string
    senderName?:    string
    recipientName?: string
    status?:        string
    limit?:         number
  },
  caller: CallerContext,
) {
  if (caller.role === 'UPLOADER') {
    return {
      found:   false,
      message: 'File transfers are managed between admins and editors. Check with your admin if you expected to receive files.',
    }
  }

  const limit = safeLimit(args.limit, 5)

  // For EDITORs restrict to transfers where they are the recipient
  const recipientFilter = caller.role === 'EDITOR'
    ? { recipientId: caller.userId }
    : {}

  const transfers = await prisma.transfer.findMany({
    where: {
      ...recipientFilter,
      ...(args.transferId ? { id: args.transferId } : {}),
      ...(args.status     ? { status: args.status as never } : { status: { not: 'EXPIRED' } }),
      ...(args.senderName ? {
        sender: {
          OR: [
            { name:     { contains: args.senderName, mode: 'insensitive' } },
            { username: { contains: args.senderName, mode: 'insensitive' } },
          ],
        },
      } : {}),
      ...(args.recipientName ? {
        recipient: {
          OR: [
            { name:     { contains: args.recipientName, mode: 'insensitive' } },
            { username: { contains: args.recipientName, mode: 'insensitive' } },
          ],
        },
      } : {}),
    },
    include: {
      sender:    { select: { name: true, username: true } },
      recipient: { select: { name: true, username: true } },
      response:  { select: { createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })

  if (transfers.length === 0) {
    return { found: false, transfers: [], message: 'No transfers found matching those criteria.' }
  }

  return {
    found:     true,
    transfers: transfers.map(t => ({
      id:            t.id,
      subject:       t.subject,
      senderName:    t.sender.username    ?? t.sender.name    ?? 'Unknown',
      recipientName: t.recipient.username ?? t.recipient.name ?? 'Unknown',
      status:        t.status,
      totalFiles:    t.totalFiles,
      sentAt:        t.createdAt.toISOString(),
      downloadedAt:  t.status !== 'PENDING' ? (t.updatedAt?.toISOString() ?? null) : null,
      respondedAt:   t.response?.createdAt.toISOString() ?? null,
      completedAt:   t.status === 'COMPLETED' ? t.updatedAt.toISOString() : null,
      expiresAt:     t.expiresAt.toISOString(),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/** All 9 Gemini FunctionDeclarations — pass as tools to getGenerativeModel(). */
export const readToolDeclarations: FunctionDeclaration[] = [
  searchFilesDecl,
  getEventContentsDecl,
  getUserActivityDecl,
  getFileDetailsDecl,
  getRecentActivityDecl,
  getStorageStatsDecl,
  getTrashContentsDecl,
  findUserDecl,
  getTransferStatusDecl,
]

/** Type of the function name to arg map for use in executeReadTool. */
type ToolArgs = Record<string, unknown>

/**
 * Central dispatcher — call the named read tool with the given args.
 *
 * Returns a plain object that is safe to pass back to Gemini as a
 * functionResponse. Never throws — errors are returned as { error: string }.
 */
export async function executeReadTool(
  toolName: string,
  args:     ToolArgs,
  caller:   CallerContext,
): Promise<object> {
  try {
    switch (toolName) {
      case 'searchFiles':
        return await searchFiles(args as Parameters<typeof searchFiles>[0], caller)
      case 'getEventContents':
        return await getEventContents(args as Parameters<typeof getEventContents>[0], caller)
      case 'getUserActivity':
        return await getUserActivity(args as Parameters<typeof getUserActivity>[0], caller)
      case 'getFileDetails':
        return await getFileDetails(args as Parameters<typeof getFileDetails>[0], caller)
      case 'getRecentActivity':
        return await getRecentActivity(args as Parameters<typeof getRecentActivity>[0], caller)
      case 'getStorageStats':
        return await getStorageStats({} as never, caller)
      case 'getTrashContents':
        return await getTrashContents(args as Parameters<typeof getTrashContents>[0], caller)
      case 'findUser':
        return await findUser(args as Parameters<typeof findUser>[0], caller)
      case 'getTransferStatus':
        return await getTransferStatus(args as Parameters<typeof getTransferStatus>[0], caller)
      default:
        return { error: `Unknown read tool: "${toolName}". This should not happen — report to admin.` }
    }
  } catch (err) {
    // Catch any unexpected Prisma or runtime error — never let it bubble up to the stream
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[read-tools] ${toolName} failed:`, msg)
    return { error: 'Database lookup failed. Please try again in a moment.' }
  }
}
