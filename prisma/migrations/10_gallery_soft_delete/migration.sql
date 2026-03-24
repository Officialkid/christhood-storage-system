-- Migration 10: Gallery soft delete
-- Extends PublicGallery with a full soft-delete / trash pattern matching the
-- existing TrashItem pattern for media files.
--
-- New enum values: DELETED (in trash, recoverable) and PURGED (permanently gone)
-- New columns:    deletedAt, deletedById, purgesAt, preDeleteStatus

-- ── 1. Extend the GalleryStatus enum ─────────────────────────────────────────
-- PostgreSQL requires each ADD VALUE in its own transaction-free statement.
ALTER TYPE "GalleryStatus" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TYPE "GalleryStatus" ADD VALUE IF NOT EXISTS 'PURGED';

-- ── 2. Add nullable columns to PublicGallery ──────────────────────────────────
ALTER TABLE "PublicGallery"
  ADD COLUMN IF NOT EXISTS "deletedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById"      TEXT,
  ADD COLUMN IF NOT EXISTS "purgesAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preDeleteStatus"  "GalleryStatus";

-- ── 3. Foreign-key: deletedById → User.id (nullify on user deletion) ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PublicGallery_deletedById_fkey'
  ) THEN
    ALTER TABLE "PublicGallery"
      ADD CONSTRAINT "PublicGallery_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. Performance indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "PublicGallery_deletedAt_idx"  ON "PublicGallery"("deletedAt");
CREATE INDEX IF NOT EXISTS "PublicGallery_purgesAt_idx"   ON "PublicGallery"("purgesAt");
CREATE INDEX IF NOT EXISTS "PublicGallery_deletedById_idx" ON "PublicGallery"("deletedById");
