-- Performance indexes for advanced search
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_uploaderId_idx"     ON "MediaFile" ("uploaderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_eventId_idx"        ON "MediaFile" ("eventId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_status_idx"         ON "MediaFile" ("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_fileType_idx"       ON "MediaFile" ("fileType");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_createdAt_idx"      ON "MediaFile" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_uploaderId_eventId_idx"     ON "MediaFile" ("uploaderId", "eventId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MediaFile_status_fileType_createdAt_idx" ON "MediaFile" ("status", "fileType", "createdAt");
