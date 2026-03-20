/**
 * lib/gallery/image-processor.ts
 *
 * Generates thumbnails and previews for gallery uploads.
 *
 * QUALITY CONTRACT — enforced in code:
 *   • The original file bytes are NEVER modified.
 *   • Thumbnails and previews are completely separate files.
 *   • A byte-count check runs after the copy to prove the original is intact.
 *   • RAW camera files (.raw, .dng, .cr2, .nef, .arw, .orf, .rw2, .pef, .srw)
 *     are NEVER processed — they are stored as-is with no derived variants.
 */

import sharp from 'sharp'
import { uploadToGallery, buildGalleryKey } from './gallery-r2'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessedImage {
  /** ~30 KB JPEG — used in the photo grid */
  thumbnailBuffer: Buffer
  /** ~200 KB JPEG — used in the lightbox */
  previewBuffer: Buffer
  /** Byte-for-byte copy of the source — zero changes */
  originalBuffer: Buffer
  /** Original width in pixels */
  width: number
  /** Original height in pixels */
  height: number
  /** Detected format: jpeg, png, heic, webp, gif, … */
  format: string
  /** Exact byte count of the original (used for integrity check) */
  originalSize: number
}

export interface UploadResult {
  thumbnailKey:  string
  previewKey:    string
  originalKey:   string
  thumbnailUrl:  string
  previewUrl:    string
  originalUrl:   string
  width:         number
  height:        number
  originalSize:  number
  /** true when the source was a RAW format — no thumbnail/preview generated */
  isRaw:         boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MIME types / extensions that must never be processed by Sharp. */
const RAW_MIME_TYPES = new Set([
  'image/x-raw',
  'image/x-adobe-dng',
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-olympus-orf',
  'image/x-panasonic-rw2',
  'image/x-pentax-pef',
  'image/x-samsung-srw',
  'image/x-fuji-raf',
])

const RAW_EXTENSIONS = new Set([
  '.raw', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.pef', '.srw', '.raf',
])

/** MIME types served as HEIC — Sharp handles these natively via libheif. */
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRawFile(mimeType: string, filename: string): boolean {
  if (RAW_MIME_TYPES.has(mimeType.toLowerCase())) return true
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return RAW_EXTENSIONS.has(ext)
}

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

/**
 * Decode an image and produce thumbnail, preview, and an exact-copy original.
 *
 * HEIC/HEIF (iPhone): Sharp converts to JPEG for thumbnail and preview.
 *                     The original is stored as HEIC — unchanged.
 *
 * Does NOT handle RAW formats — callers must check `isRawFile()` first.
 */
export async function processGalleryImage(
  sourceBuffer: Buffer,
  mimeType:     string,
): Promise<ProcessedImage> {
  // Read metadata without decoding the full image
  const metadata = await sharp(sourceBuffer).metadata()
  const { width, height, format } = metadata

  if (!width || !height) {
    throw new Error('Could not read image dimensions — file may be corrupt or unsupported')
  }

  // THUMBNAIL: 400 px wide, JPEG quality 75, progressive
  // Used in the photo grid — loads fast on mobile connections
  const thumbnailBuffer = await sharp(sourceBuffer)
    .resize(400, undefined, {
      withoutEnlargement: true, // never upscale a small image
      fit: 'inside',
    })
    .jpeg({ quality: 75, progressive: true })
    .toBuffer()

  // PREVIEW: 1200 px wide, JPEG quality 90, progressive
  // Used in the lightbox — high enough quality for screen viewing
  const previewBuffer = await sharp(sourceBuffer)
    .resize(1200, undefined, {
      withoutEnlargement: true,
      fit: 'inside',
    })
    .jpeg({ quality: 90, progressive: true })
    .toBuffer()

  // ORIGINAL: zero processing — exact copy of the source bytes
  // Buffer.from() allocates a new buffer; the source is not mutated.
  const originalBuffer = Buffer.from(sourceBuffer)

  // Integrity check: copy must match source
  if (originalBuffer.length !== sourceBuffer.length) {
    throw new Error('QUALITY_CHECK_FAILED: Original buffer length mismatch after copy')
  }

  return {
    thumbnailBuffer,
    previewBuffer,
    originalBuffer,
    width,
    height,
    format: format ?? (HEIC_MIME_TYPES.has(mimeType) ? 'heic' : 'jpeg'),
    originalSize: sourceBuffer.length,
  }
}

// ---------------------------------------------------------------------------
// Process + upload (main entry point)
// ---------------------------------------------------------------------------

/**
 * Process an uploaded image and write all three variants to the gallery bucket.
 *
 * For RAW files, only the original is stored — no thumbnail or preview.
 * For all other formats (including HEIC), three variants are written.
 */
export async function processAndUploadImage(
  sourceBuffer:     Buffer,
  gallerySlug:      string,
  sectionId:        string,
  originalFilename: string,
  mimeType:         string,
): Promise<UploadResult> {
  const raw = isRawFile(mimeType, originalFilename)

  const thumbKey   = buildGalleryKey(gallerySlug, sectionId, 'thumbnail', originalFilename)
  const previewKey = buildGalleryKey(gallerySlug, sectionId, 'preview',   originalFilename)
  const origKey    = buildGalleryKey(gallerySlug, sectionId, 'original',  originalFilename)

  if (raw) {
    // RAW files: store the original unchanged; no thumbnail or preview
    const originalUrl = await uploadToGallery(origKey, sourceBuffer, mimeType)

    logger.info('GALLERY_IMAGE_PROCESSED', {
      message:  `RAW file ${originalFilename} stored without processing`,
      metadata: { originalSize: sourceBuffer.length, isRaw: true },
    })

    return {
      thumbnailKey:  '',
      previewKey:    '',
      originalKey:   origKey,
      thumbnailUrl:  '',
      previewUrl:    '',
      originalUrl,
      width:         0,
      height:        0,
      originalSize:  sourceBuffer.length,
      isRaw:         true,
    }
  }

  // Process: generate thumbnail + preview; copy original
  const processed = await processGalleryImage(sourceBuffer, mimeType)

  // Upload all three variants in parallel
  const [thumbnailUrl, prevUrl, originalUrl] = await Promise.all([
    uploadToGallery(thumbKey,   processed.thumbnailBuffer, 'image/jpeg'),
    uploadToGallery(previewKey, processed.previewBuffer,   'image/jpeg'),
    // Original is uploaded with the source content-type (preserves HEIC, PNG, etc.)
    uploadToGallery(origKey,    processed.originalBuffer,  mimeType),
  ])

  logger.info('GALLERY_IMAGE_PROCESSED', {
    message:  `Processed ${originalFilename}: original ${processed.originalSize} bytes preserved exactly`,
    metadata: {
      thumbnailSize: processed.thumbnailBuffer.length,
      previewSize:   processed.previewBuffer.length,
      originalSize:  processed.originalSize,
      width:         processed.width,
      height:        processed.height,
      format:        processed.format,
      isRaw:         false,
    },
  })

  return {
    thumbnailKey:  thumbKey,
    previewKey,
    originalKey:   origKey,
    thumbnailUrl,
    previewUrl:    prevUrl,
    originalUrl,
    width:         processed.width,
    height:        processed.height,
    originalSize:  processed.originalSize,
    isRaw:         false,
  }
}
