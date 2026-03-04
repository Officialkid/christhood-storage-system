/**
 * lib/thumbnail.ts
 *
 * Server-side thumbnail generation for photos and videos.
 *
 * Photos   — Sharp resizes + crops the original to a 480×480 JPEG.
 * Videos   — ffmpeg extracts the frame at t=1 s and scales it to 480×480.
 *             Source video is streamed to a temporary file then deleted.
 *
 * Called fire-and-forget from upload routes.  All errors are swallowed so
 * a thumbnail failure never blocks or fails an upload.
 */

import sharp          from 'sharp'
import ffmpeg         from 'fluent-ffmpeg'
import * as fs        from 'fs/promises'
import * as os        from 'os'
import * as nodePath  from 'path'
import { prisma }     from './prisma'
import { getObjectBuffer, putObjectBuffer } from './r2'

// ── ffmpeg binary ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as { path: string; version: string }
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

// ── Config ────────────────────────────────────────────────────────────────────
const THUMB_SIZE = 480   // pixels — square crop

/** Raw / proprietary formats Sharp cannot decode — skip silently. */
const SKIP_EXTS = new Set(['.dng', '.cr2', '.nef', '.arw', '.orf', '.raw'])

// ── Helpers ───────────────────────────────────────────────────────────────────

export function thumbnailKey(mediaFileId: string): string {
  return `thumbnails/${mediaFileId}.jpg`
}

/** Resize an image buffer to a THUMB_SIZE×THUMB_SIZE cover-crop JPEG. */
async function resizeImage(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate()           // auto-rotate based on EXIF orientation
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 78 })
    .toBuffer()
}

/**
 * Extract the frame at t=1 s from a video file.
 * Writes input + output to os.tmpdir() and cleans up afterwards.
 */
async function extractVideoFrame(videoBuf: Buffer, ext: string): Promise<Buffer> {
  const id      = `cmms-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inFile  = nodePath.join(os.tmpdir(), `${id}${ext || '.mp4'}`)
  const outFile = nodePath.join(os.tmpdir(), `${id}.jpg`)

  await fs.writeFile(inFile, videoBuf)

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inFile)
        .inputOptions(['-ss 00:00:01'])
        .outputOptions([
          '-vframes 1',
          `-vf scale=${THUMB_SIZE}:${THUMB_SIZE}:force_original_aspect_ratio=increase,crop=${THUMB_SIZE}:${THUMB_SIZE}`,
        ])
        .on('end',   () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(outFile)
    })
    return await fs.readFile(outFile)
  } finally {
    await fs.unlink(inFile).catch(() => {})
    await fs.unlink(outFile).catch(() => {})
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a JPEG thumbnail for a newly-uploaded file, store it in R2,
 * and write the key back to the MediaFile record.
 *
 * Designed to be called fire-and-forget (`generateAndStoreThumbnail(...).catch(console.error)`).
 * All internal errors are caught so the upload pipeline is never affected.
 */
export async function generateAndStoreThumbnail(
  mediaFileId:  string,
  r2Key:        string,
  fileType:     'PHOTO' | 'VIDEO',
  contentType:  string,
  originalName: string,
): Promise<void> {
  try {
    const ext = nodePath.extname(originalName).toLowerCase()
    if (SKIP_EXTS.has(ext)) return   // RAW/proprietary formats — skip

    const srcBuf = await getObjectBuffer(r2Key)

    let thumbBuf: Buffer
    if (fileType === 'VIDEO') {
      thumbBuf = await extractVideoFrame(srcBuf, ext)
    } else {
      thumbBuf = await resizeImage(srcBuf)
    }

    const key = thumbnailKey(mediaFileId)
    await putObjectBuffer(key, thumbBuf, 'image/jpeg')

    await prisma.mediaFile.update({
      where: { id: mediaFileId },
      data:  { thumbnailKey: key },
    })
  } catch (err) {
    console.error('[thumbnail] failed for mediaFileId=%s:', mediaFileId, err)
    // Never re-throw — thumbnail failure must not fail uploads
  }
}
