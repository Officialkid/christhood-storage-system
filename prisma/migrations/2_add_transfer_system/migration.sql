-- Files in this system are NEVER recompressed, resized, or altered in any way.
-- Checksums are computed on upload and verified on download to guarantee byte-for-byte integrity.
-- The ZIP packaging uses STORE method (no compression) for already-compressed formats (jpg, mp4, png)
-- and DEFLATE only for uncompressed formats (raw, tiff, bmp) to preserve maximum quality.

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'DOWNLOADED', 'RESPONDED', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "folderStructure" JSONB,
    "r2Prefix" TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL,
    "totalSize" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferFile" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "folderPath" TEXT,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferResponse" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "message" TEXT,
    "r2Prefix" TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL,
    "totalSize" BIGINT NOT NULL,
    "downloadedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferResponseFile" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "folderPath" TEXT,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferResponseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferResponse_transferId_key" ON "TransferResponse"("transferId");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferFile" ADD CONSTRAINT "TransferFile_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferResponse" ADD CONSTRAINT "TransferResponse_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferResponse" ADD CONSTRAINT "TransferResponse_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferResponseFile" ADD CONSTRAINT "TransferResponseFile_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "TransferResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
