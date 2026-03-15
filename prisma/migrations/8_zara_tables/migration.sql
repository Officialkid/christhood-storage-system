-- Migration 8: Zara AI tables + missing User columns
-- Adds ZaraActionLog, ZaraUsageLog, ZaraConversationLog tables.
-- Adds User columns that were added via manual scripts (idempotent — uses IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- User: brute-force lockout (may already exist from add-login-lockout-fields.mjs)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

-- User: Zara privacy opt-out flag
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zaraLoggingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- User: self-initiated account-deletion grace period
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingDeletionAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingDeletionAction" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ZaraActionLog — every confirmed Zara action, with rollback support
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ZaraActionLog" (
    "id"                     TEXT NOT NULL,
    "actionType"             TEXT NOT NULL,
    "riskLevel"              TEXT NOT NULL,
    "requestedByUserId"      TEXT NOT NULL,
    "requestedByName"        TEXT NOT NULL,
    "confirmedAt"            TIMESTAMP(3) NOT NULL,
    "executedAt"             TIMESTAMP(3),
    "completedAt"            TIMESTAMP(3),
    "status"                 TEXT NOT NULL DEFAULT 'PENDING',
    "inputArgs"              JSONB NOT NULL,
    "preActionSnapshot"      JSONB,
    "postActionResult"       JSONB,
    "rollbackData"           JSONB,
    "rollbackAvailableUntil" TIMESTAMP(3),
    "notes"                  TEXT,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZaraActionLog_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ZaraUsageLog — one row per chat session (analytics)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ZaraUsageLog" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "sessionId"        TEXT NOT NULL,
    "messageCount"     INTEGER NOT NULL,
    "toolsUsed"        TEXT[] NOT NULL DEFAULT '{}',
    "actionsProposed"  INTEGER NOT NULL,
    "actionsConfirmed" INTEGER NOT NULL,
    "actionsCancelled" INTEGER NOT NULL,
    "responseTimeMs"   INTEGER NOT NULL,
    "errorCount"       INTEGER NOT NULL,
    "startedAt"        TIMESTAMP(3) NOT NULL,
    "endedAt"          TIMESTAMP(3),
    "pageContext"      TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZaraUsageLog_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ZaraConversationLog — GDPR-compliant per-message metadata (sanitized)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ZaraConversationLog" (
    "id"                  TEXT NOT NULL,
    "sessionId"           TEXT NOT NULL,
    "anonymousUserId"     TEXT NOT NULL,
    "userRoleCategory"    TEXT NOT NULL,
    "pageContext"         TEXT NOT NULL,
    "messageIndex"        INTEGER NOT NULL,
    "messageType"         TEXT NOT NULL,
    "userMessageCleaned"  TEXT,
    "toolsTriggered"      TEXT[] NOT NULL DEFAULT '{}',
    "intentCategory"      TEXT,
    "responseSummary"     TEXT,
    "responseTimeMs"      INTEGER,
    "usedToolData"        BOOLEAN,
    "actionProposed"      TEXT,
    "actionOutcome"       TEXT,
    "qualitySignals"      JSONB,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionExpiresAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZaraConversationLog_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Foreign keys (idempotent — EXCEPTION block swallows duplicate_object errors)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE "ZaraActionLog"
        ADD CONSTRAINT "ZaraActionLog_requestedByUserId_fkey"
        FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$ BEGIN
    ALTER TABLE "ZaraUsageLog"
        ADD CONSTRAINT "ZaraUsageLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ZaraActionLog_requestedByUserId_idx" ON "ZaraActionLog"("requestedByUserId");
CREATE INDEX IF NOT EXISTS "ZaraActionLog_status_idx"            ON "ZaraActionLog"("status");
CREATE INDEX IF NOT EXISTS "ZaraActionLog_createdAt_idx"         ON "ZaraActionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ZaraActionLog_actionType_idx"        ON "ZaraActionLog"("actionType");

CREATE INDEX IF NOT EXISTS "ZaraUsageLog_userId_idx"    ON "ZaraUsageLog"("userId");
CREATE INDEX IF NOT EXISTS "ZaraUsageLog_startedAt_idx" ON "ZaraUsageLog"("startedAt");
CREATE INDEX IF NOT EXISTS "ZaraUsageLog_sessionId_idx" ON "ZaraUsageLog"("sessionId");

CREATE INDEX IF NOT EXISTS "ZaraConversationLog_sessionId_idx"          ON "ZaraConversationLog"("sessionId");
CREATE INDEX IF NOT EXISTS "ZaraConversationLog_anonymousUserId_idx"    ON "ZaraConversationLog"("anonymousUserId");
CREATE INDEX IF NOT EXISTS "ZaraConversationLog_intentCategory_idx"     ON "ZaraConversationLog"("intentCategory");
CREATE INDEX IF NOT EXISTS "ZaraConversationLog_createdAt_idx"          ON "ZaraConversationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ZaraConversationLog_retentionExpiresAt_idx" ON "ZaraConversationLog"("retentionExpiresAt");
