-- Migration: 11_add_2fa_fields
-- Adds TOTP-based two-factor authentication fields to the User table.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled"     BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorSecret"      TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[]   NOT NULL DEFAULT '{}';
