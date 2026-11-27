import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Cloudflare R2 exposes an S3-compatible endpoint at:
// https://<ACCOUNT_ID>.r2.cloudflarestorage.com
const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!
  }
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

/** Generate a presigned PUT URL so the client can upload directly to R2. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: contentType
  })
  return getSignedUrl(R2, command, { expiresIn: expiresInSeconds })
}

/** Generate a presigned GET URL to securely serve a private object.
 *
 * Pass `originalName` to embed a `Content-Disposition: attachment` header
 * inside the presigned URL, so the browser always saves the file with the
 * correct human-readable filename regardless of the R2 object key.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600,
  originalName?: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key,
    // RFC 5987 encoding ensures unicode filenames survive the URL round-trip
    ...(originalName && {
      ResponseContentDisposition:
        `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    }),
  })
  // Bucket signingDate into 15-minute windows for standard >=30-min presigned URLs
  // so browser disk caching works across navigations and 15-second dashboard refreshes!
  const signingDate = expiresInSeconds >= 1800
    ? new Date(Math.floor(Date.now() / 900_000) * 900_000)
    : undefined
  return getSignedUrl(R2, command, {
    expiresIn: expiresInSeconds,
    ...(signingDate ? { signingDate } : {}),
  })
}

/** Server-side zero-bandwidth copy within Cloudflare R2. */
export async function copyObject(sourceKey: string, destKey: string): Promise<void> {
  const encodedSource = sourceKey.split('/').map(encodeURIComponent).join('/')
  await R2.send(
    new CopyObjectCommand({
      Bucket:     BUCKET,
      CopySource: `${BUCKET}/${encodedSource}`,
      Key:        destKey,
    }),
  )
}

/** Lightweight HEAD check on an R2 object (returns contentLength & etag without downloading bytes). */
export async function headObject(key: string): Promise<{ size: number; etag: string | null } | null> {
  try {
    const res = await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return { size: res.ContentLength ?? 0, etag: res.ETag?.replace(/"/g, '') ?? null }
  } catch {
    return null
  }
}

/** Permanently delete an object from R2. */
export async function deleteObject(key: string): Promise<void> {
  await R2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// ──────────────────── Multipart upload helpers ────────────────────

/** Initiate a multipart upload; returns the UploadId. */
export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const { UploadId } = await R2.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
  )
  if (!UploadId) throw new Error('R2 did not return an UploadId')
  return UploadId
}

/** Return a presigned URL for uploading one part (PartNumber is 1-based). */
export async function getPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 3600,
): Promise<string> {
  return getSignedUrl(
    R2,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: expiresInSeconds },
  )
}

/** Assemble all parts and finalize the multipart upload. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  await R2.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  )
}

/** Cancel an in-progress multipart upload to avoid storage costs for incomplete uploads. */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await R2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }))
}

export { R2, BUCKET }

// ──────────────────── Binary object helpers ───────────────────────────────────

/**
 * Download an R2 object and return its contents as a Buffer.
 * Used server-side for thumbnail generation.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { Body } = await R2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  if (!Body) throw new Error(`R2 object not found: ${key}`)
  const bytes = await (Body as any).transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Upload a file buffer directly to R2 from the server.
 * Used for public-share uploads to avoid browser CORS restrictions.
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await R2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }))
}

/**
 * Upload a raw Buffer to R2 (used to store generated thumbnails).
 */
export async function putObjectBuffer(
  key:         string,
  data:        Buffer,
  contentType: string,
): Promise<void> {
  await R2.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        data,
      ContentType: contentType,
    }),
  )
}
