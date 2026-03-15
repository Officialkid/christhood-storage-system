-- Migration 7: Notification enhancements
-- Adds type + title to Notification for richer bell panel display.
-- Adds emailDigestFrequency to User for per-user email cadence preference.
-- ─────────────────────────────────────────────────────────────────────────────

-- Notification: add type (default "SYSTEM") and title (default "")
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "type"  TEXT NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '';

-- Notification: recency index used when loading the bell panel feed
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- User: per-user email digest frequency preference
-- Valid values: "IMMEDIATE" | "DAILY" | "WEEKLY" | "NEVER"
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailDigestFrequency" TEXT NOT NULL DEFAULT 'IMMEDIATE';
