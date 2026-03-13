-- Migration 5: Add isDefault, isArchived, createdByUserId to EventCategory
-- Adds fields that support the official Christhood category list,
-- custom category creation via "Other", and per-category archiving.
-- ─────────────────────────────────────────────────────────────────────────────

-- New columns
ALTER TABLE "EventCategory" ADD COLUMN "isDefault"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventCategory" ADD COLUMN "isArchived"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventCategory" ADD COLUMN "createdByUserId" TEXT;

-- Foreign key: custom categories record the user who created them
ALTER TABLE "EventCategory"
  ADD CONSTRAINT "EventCategory_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS "EventCategory_isArchived_idx" ON "EventCategory"("isArchived");
CREATE INDEX IF NOT EXISTS "EventCategory_yearId_idx"     ON "EventCategory"("yearId");

-- Mark any rows matching the 7 official Christhood categories
UPDATE "EventCategory"
SET "isDefault" = true
WHERE "name" IN (
  'Saturday Fellowships',
  'Missions',
  'Branch Excandidates Programme',
  'Teen Life',
  'Mentorship Camp',
  'Jewels Kids Camp',
  'Special Events'
);
