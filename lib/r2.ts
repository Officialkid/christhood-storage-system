import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

/** Generate a presigned GET URL to securely serve a private object. */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(R2, command, { expiresIn: expiresInSeconds })
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
