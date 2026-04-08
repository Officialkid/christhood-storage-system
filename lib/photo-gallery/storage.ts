/**
 * lib/photo-gallery/storage.ts
 *
 * Photo Gallery Platform — image processing and R2 upload helpers.
 * Reuses the christhood-gallery bucket with the "photo-platform/" prefix.
 *
 * Key structure:
 *   photo-platform/[userId]/[albumId]/thumb/[ts]-[safename]    — ~30 KB JPEG
 *   photo-platform/[userId]/[albumId]/preview/[ts]-[safename]  — ~200 KB JPEG
 *   photo-platform/[userId]/[albumId]/original/[ts]-[safename] — original bytes
 */

import sharp from 'sharp'
import { uploadToGallery, getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'

export interface PlatformUploadResult {
  thumbnailKey:  string
  previewKey:    string
  originalKey:   string
  thumbnailUrl:  string
  previewUrl:    string
  originalUrl:   string
  width:         number
  height:        number
  fileSizeBytes: number
  mimeType:      string
}

const PREFIX = 'photo-platform'

const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export function isAcceptedImageType(mime: string): boolean {
  return ACCEPTED_TYPES.has(mime.toLowerCase())
}

/**
 * Process a photo buffer and upload 3 variants (thumb, preview, original) to R2.
 * Returns all keys + public URLs.
 */
export async function processPlatformPhoto(
  buffer:       Buffer,
  originalName: string,
  mimeType:     string,
  userId:       string,
  albumId:      string,
): Promise<PlatformUploadResult> {
  const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const thumbKey    = `${PREFIX}/${userId}/${albumId}/thumb/${safeName}`
  const previewKey  = `${PREFIX}/${userId}/${albumId}/preview/${safeName}`
  const originalKey = `${PREFIX}/${userId}/${albumId}/original/${safeName}`

  const meta = await sharp(buffer).metadata()
  const width  = meta.width  ?? 0
  const height = meta.height ?? 0

  // Thumbnail — max 500px, ~30 KB
  const thumbBuf = await sharp(buffer)
    .rotate()                              // honour EXIF orientation
    .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, progressive: true })
    .toBuffer()

  // Preview — max 1400px, ~200 KB
  const previewBuf = await sharp(buffer)
    .rotate()
    .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, progressive: true })
    .toBuffer()

  await Promise.all([
    uploadToGallery(thumbKey,    thumbBuf,   'image/jpeg'),
    uploadToGallery(previewKey,  previewBuf, 'image/jpeg'),
    uploadToGallery(originalKey, buffer,     mimeType),
  ])

  return {
    thumbnailKey:  thumbKey,
    previewKey,
    originalKey,
    thumbnailUrl:  getGalleryPublicUrl(thumbKey),
    previewUrl:    getGalleryPublicUrl(previewKey),
    originalUrl:   getGalleryPublicUrl(originalKey),
    width,
    height,
    fileSizeBytes: buffer.length,
    mimeType,
  }
}

/**
 * Delete all 3 R2 variants for a PhotoItem.
 */
export async function deletePlatformPhoto(
  thumbnailKey: string,
  previewKey:   string,
  originalKey:  string,
): Promise<void> {
  const { deleteFromGallery } = await import('@/lib/gallery/gallery-r2')
  await Promise.allSettled([
    deleteFromGallery(thumbnailKey),
    deleteFromGallery(previewKey),
    deleteFromGallery(originalKey),
  ])
}
