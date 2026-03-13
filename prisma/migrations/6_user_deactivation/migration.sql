-- Migration 6: User deactivation system + safe account deletion
-- Adds isActive flag so admins can block logins without deleting accounts.
-- Makes ActivityLog.userId nullable so audit logs survive after user deletion.
-- ─────────────────────────────────────────────────────────────────────────────

-- User: deactivation fields
ALTER TABLE "User" ADD COLUMN "isActive"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "deactivatedAt"   TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivatedById" TEXT;

-- FK: self-referential "who deactivated this user" — SET NULL preserves history
ALTER TABLE "User"
  ADD CONSTRAINT "User_deactivatedById_fkey"
  FOREIGN KEY ("deactivatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index: fast lookup of all active/inactive users
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");

-- ActivityLog: make userId nullable so we can null it on user deletion
-- (preserves the audit trail as anonymous entries instead of deleting logs)
ALTER TABLE "ActivityLog" ALTER COLUMN "userId" DROP NOT NULL;
