-- AlterTable: add optional recipientEmail column to PublicShareUpload
ALTER TABLE "PublicShareUpload" ADD COLUMN "recipientEmail" TEXT;
