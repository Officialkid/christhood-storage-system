-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "GalleryStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "GalleryFileType" AS ENUM ('PHOTO', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicGallery" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageKey" TEXT,
    "eventId" TEXT,
    "categoryName" TEXT,
    "year" INTEGER NOT NULL,
    "status" "GalleryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isPasswordProtected" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "allowFullRes" BOOLEAN NOT NULL DEFAULT true,
    "requireNameForDownload" BOOLEAN NOT NULL DEFAULT false,
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "r2Bucket" TEXT NOT NULL DEFAULT 'christhood-gallery',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicGallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GallerySection" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "coverKey" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GallerySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GalleryFile" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "sectionId" TEXT,
    "mediaFileId" TEXT,
    "thumbnailKey" TEXT NOT NULL,
    "previewKey" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" "GalleryFileType" NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GalleryView" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceType" TEXT,
    "country" TEXT,

    CONSTRAINT "GalleryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GalleryDownload" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "fileId" TEXT,
    "downloadType" TEXT NOT NULL,
    "visitorName" TEXT,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceType" TEXT,

    CONSTRAINT "GalleryDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FaceEmbedding" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "faceIndex" INTEGER NOT NULL,
    "vector" DOUBLE PRECISION[],
    "boundingBox" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "PublicGallery_slug_key" ON "PublicGallery"("slug");
CREATE INDEX IF NOT EXISTS "PublicGallery_slug_idx" ON "PublicGallery"("slug");
CREATE INDEX IF NOT EXISTS "PublicGallery_status_idx" ON "PublicGallery"("status");
CREATE INDEX IF NOT EXISTS "PublicGallery_year_idx" ON "PublicGallery"("year");
CREATE INDEX IF NOT EXISTS "PublicGallery_eventId_idx" ON "PublicGallery"("eventId");
CREATE INDEX IF NOT EXISTS "PublicGallery_createdById_idx" ON "PublicGallery"("createdById");
CREATE INDEX IF NOT EXISTS "GallerySection_galleryId_idx" ON "GallerySection"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryFile_galleryId_idx" ON "GalleryFile"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryFile_sectionId_idx" ON "GalleryFile"("sectionId");
CREATE INDEX IF NOT EXISTS "GalleryFile_mediaFileId_idx" ON "GalleryFile"("mediaFileId");
CREATE INDEX IF NOT EXISTS "GalleryFile_fileType_idx" ON "GalleryFile"("fileType");
CREATE INDEX IF NOT EXISTS "GalleryView_galleryId_idx" ON "GalleryView"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryView_viewedAt_idx" ON "GalleryView"("viewedAt");
CREATE INDEX IF NOT EXISTS "GalleryDownload_galleryId_idx" ON "GalleryDownload"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryDownload_fileId_idx" ON "GalleryDownload"("fileId");
CREATE INDEX IF NOT EXISTS "GalleryDownload_downloadedAt_idx" ON "GalleryDownload"("downloadedAt");
CREATE INDEX IF NOT EXISTS "FaceEmbedding_fileId_idx" ON "FaceEmbedding"("fileId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "PublicGallery" ADD CONSTRAINT "PublicGallery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PublicGallery" ADD CONSTRAINT "PublicGallery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PublicGallery" ADD CONSTRAINT "PublicGallery_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GallerySection" ADD CONSTRAINT "GallerySection_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PublicGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryFile" ADD CONSTRAINT "GalleryFile_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PublicGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryFile" ADD CONSTRAINT "GalleryFile_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GallerySection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryFile" ADD CONSTRAINT "GalleryFile_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryView" ADD CONSTRAINT "GalleryView_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PublicGallery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryDownload" ADD CONSTRAINT "GalleryDownload_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PublicGallery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GalleryDownload" ADD CONSTRAINT "GalleryDownload_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "GalleryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FaceEmbedding" ADD CONSTRAINT "FaceEmbedding_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "GalleryFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
