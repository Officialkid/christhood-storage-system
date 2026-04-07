-- CreateTable
CREATE TABLE "PublicShareUpload" (
    "id"            TEXT NOT NULL,
    "token"         TEXT NOT NULL,
    "r2Key"         TEXT NOT NULL,
    "originalName"  TEXT NOT NULL,
    "fileSize"      BIGINT NOT NULL,
    "mimeType"      TEXT NOT NULL,
    "title"         TEXT,
    "message"       TEXT,
    "pinHash"       TEXT,
    "expiresAt"     TIMESTAMP(3) NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "isReady"       BOOLEAN NOT NULL DEFAULT false,
    "uploaderIp"    TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicShareUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicShareUpload_token_key" ON "PublicShareUpload"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PublicShareUpload_r2Key_key" ON "PublicShareUpload"("r2Key");

-- CreateIndex
CREATE INDEX "PublicShareUpload_token_idx" ON "PublicShareUpload"("token");

-- CreateIndex
CREATE INDEX "PublicShareUpload_expiresAt_idx" ON "PublicShareUpload"("expiresAt");

-- CreateIndex
CREATE INDEX "PublicShareUpload_isReady_idx" ON "PublicShareUpload"("isReady");
