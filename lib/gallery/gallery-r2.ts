/**
 * GALLERY R2 CLIENT
 *
 * Uses GALLERY_R2_* environment variables — completely separate from the
 * CMMS R2 client (lib/r2.ts) which uses CLOUDFLARE_R2_* variables.
 *
 * ⚠️  NEVER import this file in CMMS routes.
 * ⚠️  NEVER import lib/r2.ts in gallery routes.
 * The two systems are independent and must never be mixed.
 *
 * R2 key structure:
 *   galleries/[gallerySlug]/sections/[sectionId]/thumbnail/[filename]  — small preview ~30KB
 *   galleries/[gallerySlug]/sections/[sectionId]/preview/[filename]    — medium quality ~200KB
 *   galleries/[gallerySlug]/sections/[sectionId]/original/[filename]   — ORIGINAL, never modified
 *   galleries/[gallerySlug]/covers/[filename]                          — gallery cover image
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ---------------------------------------------------------------------------
// Client — instantiated once at module load
// ---------------------------------------------------------------------------

const galleryR2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.GALLERY_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.GALLERY_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.GALLERY_R2_SECRET_ACCESS_KEY!,
  },
})

const GALLERY_BUCKET     = process.env.GALLERY_R2_BUCKET_NAME!
const GALLERY_PUBLIC_URL = process.env.GALLERY_R2_PUBLIC_URL!

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a buffer to the gallery bucket and return its public URL.
 * The gallery bucket is public — no ACL or presigned URL required for reads.
 */
export async function uploadToGallery(
  key:         string,
  body:        Buffer | Uint8Array,
  contentType: string,
  metadata?:   Record<string, string>,
): Promise<string> {
  try {
    await galleryR2.send(new PutObjectCommand({
      Bucket:      GALLERY_BUCKET,
      Key:         key,
      Body:        body,
      ContentType: contentType,
      Metadata:    metadata,
    }))
    return `${GALLERY_PUBLIC_URL}/${key}`
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`GALLERY_R2: upload failed for key "${key}" — ${detail}`)
  }
}

// ---------------------------------------------------------------------------
// Public URL (no presigning — bucket is public)
// ---------------------------------------------------------------------------

/**
 * Return the permanent public CDN URL for a gallery object.
 * No signing required because the gallery bucket is publicly readable.
 */
export function getGalleryPublicUrl(key: string): string {
  return `${GALLERY_PUBLIC_URL}/${key}`
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Permanently remove an object from the gallery bucket. */
export async function deleteFromGallery(key: string): Promise<void> {
  await galleryR2.send(new DeleteObjectCommand({
    Bucket: GALLERY_BUCKET,
    Key:    key,
  }))
}

// ---------------------------------------------------------------------------
// Presigned upload URL (for direct browser → R2 uploads)
// ---------------------------------------------------------------------------

/**
 * Generate a time-limited presigned PUT URL so an uploader can stream a file
 * directly to R2 without routing the bytes through the Next.js server.
 */
export async function getGalleryUploadUrl(
  key:         string,
  contentType: string,
  expiresIn =  3600,
): Promise<string> {
  return getSignedUrl(
    galleryR2,
    new PutObjectCommand({
      Bucket:      GALLERY_BUCKET,
      Key:         key,
      ContentType: contentType,
    }),
    { expiresIn },
  )
}

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

/**
 * Build an R2 key for a gallery file variant.
 *
 * @param gallerySlug  - URL slug of the gallery, e.g. "easter-sunday-2026"
 * @param sectionId    - GallerySection.id (cuid)
 * @param variant      - "thumbnail" | "preview" | "original"
 * @param filename     - sanitised original filename, e.g. "IMG_0042.jpg"
 */
export function buildGalleryKey(
  gallerySlug: string,
  sectionId:   string,
  variant:     'thumbnail' | 'preview' | 'original',
  filename:    string,
): string {
  return `galleries/${gallerySlug}/sections/${sectionId}/${variant}/${filename}`
}

/**
 * Build an R2 key for a gallery cover image.
 */
export function buildGalleryCoverKey(gallerySlug: string, filename: string): string {
  return `galleries/${gallerySlug}/covers/${filename}`
}
