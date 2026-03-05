-- AlterTable: add archive tracking fields to MediaFile
ALTER TABLE "MediaFile" ADD COLUMN "archivedAt"        TIMESTAMP(3);
ALTER TABLE "MediaFile" ADD COLUMN "preArchiveStatus"  "FileStatus";

-- CreateTable: global application settings (key/value store)
CREATE TABLE "AppSetting" (
    "key"       TEXT         NOT NULL,
    "value"     TEXT         NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Seed default archive threshold (6 months)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('archive_threshold_months', '6', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
