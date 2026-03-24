-- Migration 11: Transfer PIN protection
-- Adds optional PIN protection to the Transfer model so senders can lock
-- a transfer behind a 4–8 digit PIN that recipients must enter to view it.
--
-- isPinProtected  – flag shown in the UI; never store raw PINs
-- pin             – bcrypt hash of the PIN (nullable; set only when isPinProtected = true)

ALTER TABLE "Transfer"
  ADD COLUMN IF NOT EXISTS "isPinProtected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pin"            TEXT;

-- Index for quick lookup of PIN-protected transfers
CREATE INDEX IF NOT EXISTS "Transfer_isPinProtected_idx" ON "Transfer"("isPinProtected");
