/**
 * GALLERY R2 CLIENT
 *
 * Auth credentials fall back to CLOUDFLARE_R2_* when GALLERY_R2_* are not set,
 * so you can reuse the same R2 account for galleries without duplicating secrets.
 *
 * REQUIRED env vars (no fallback — must be explicitly configured):
 *   GALLERY_R2_BUCKET_NAME   — name of the gallery R2 bucket
 *   GALLERY_R2_PUBLIC_URL    — public CDN base URL, e.g. https://gallery.r2.yourdomain.com
 *
 * OPTIONAL env vars (fall back to CLOUDFLARE_R2_* if absent):
 *   GALLERY_R2_ACCOUNT_ID    — Cloudflare account ID
 *   GALLERY_R2_ACCESS_KEY_ID — R2 API token key ID
 *   GALLERY_R2_SECRET_ACCESS_KEY — R2 API token secret
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
// Config — with fallback to main CLOUDFLARE_R2_* credentials
// ---------------------------------------------------------------------------

const accountId  = process.env.GALLERY_R2_ACCOUNT_ID    ?? process.env.CLOUDFLARE_R2_ACCOUNT_ID
const accessKey  = process.env.GALLERY_R2_ACCESS_KEY_ID ?? process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const secretKey  = process.env.GALLERY_R2_SECRET_ACCESS_KEY ?? process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY

const GALLERY_BUCKET     = process.env.GALLERY_R2_BUCKET_NAME
const GALLERY_PUBLIC_URL = process.env.GALLERY_R2_PUBLIC_URL

// Guard: fail fast with a meaningful error at call-time (not at module load)
// so the rest of the app still boots even if gallery storage isn't configured.
function assertConfigured(): void {
  if (!GALLERY_BUCKET || !GALLERY_PUBLIC_URL || !accountId || !accessKey || !secretKey) {
    throw new Error(
      'GALLERY_R2: storage is not fully configured. ' +
      'Set GALLERY_R2_BUCKET_NAME, GALLERY_R2_PUBLIC_URL, and either ' +
      'GALLERY_R2_ACCESS_KEY_ID / GALLERY_R2_SECRET_ACCESS_KEY / GALLERY_R2_ACCOUNT_ID ' +
      '(or let them fall back to CLOUDFLARE_R2_* equivalents).'
    )
  }
}

// Client — created lazily so module-load doesn't fail when env vars are absent
let _client: S3Client | null = null
function getClient(): S3Client {
  assertConfigured()
  if (!_client) {
    _client = new S3Client({
      region:   'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     accessKey!,
        secretAccessKey: secretKey!,
      },
    })
  }
  return _client
}

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
  assertConfigured()
  try {
    await getClient().send(new PutObjectCommand({
      Bucket:      GALLERY_BUCKET!,
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
  if (!GALLERY_PUBLIC_URL) throw new Error('GALLERY_R2: GALLERY_R2_PUBLIC_URL is not set')
  return `${GALLERY_PUBLIC_URL}/${key}`
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Permanently remove an object from the gallery bucket. */
export async function deleteFromGallery(key: string): Promise<void> {
  assertConfigured()
  await getClient().send(new DeleteObjectCommand({
    Bucket: GALLERY_BUCKET!,
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
  assertConfigured()
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket:      GALLERY_BUCKET!,
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
