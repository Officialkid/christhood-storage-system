-- Migration: 4_add_share_links
-- Adds ShareLink and ShareLinkAccess tables for external file sharing.

-- ShareLink: a time-limited, optionally PIN-protected public URL
CREATE TABLE "ShareLink" (
    "id"           TEXT NOT NULL,
    "token"        TEXT NOT NULL,
    "createdById"  TEXT NOT NULL,
    "linkType"     TEXT NOT NULL,
    "fileId"       TEXT,
    "eventId"      TEXT,
    "subfolderId"  TEXT,
    "transferId"   TEXT,
    "title"        TEXT NOT NULL,
    "message"      TEXT,
    "pinHash"      TEXT,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "isRevoked"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- ShareLinkAccess: one row per page-view or download on a ShareLink
CREATE TABLE "ShareLinkAccess" (
    "id"          TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "accessedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress"   TEXT NOT NULL,
    "userAgent"   TEXT NOT NULL,
    "downloaded"  BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShareLinkAccess_pkey" PRIMARY KEY ("id")
);

-- Unique / foreign-key constraints
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_token_key" UNIQUE ("token");
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShareLinkAccess" ADD CONSTRAINT "ShareLinkAccess_shareLinkId_fkey"
    FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ShareLink_token_idx"     ON "ShareLink"("token");
CREATE INDEX "ShareLink_createdById_idx" ON "ShareLink"("createdById");
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");
CREATE INDEX "ShareLink_isRevoked_idx" ON "ShareLink"("isRevoked");

CREATE INDEX "ShareLinkAccess_shareLinkId_idx" ON "ShareLinkAccess"("shareLinkId");
CREATE INDEX "ShareLinkAccess_accessedAt_idx"  ON "ShareLinkAccess"("accessedAt");
