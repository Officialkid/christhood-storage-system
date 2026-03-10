/**
 * set-r2-cors.mjs
 *
 * Configures CORS on the Cloudflare R2 bucket so that browsers can PUT
 * files directly from https://cmmschristhood.org (presigned URL uploads).
 *
 * Run once (or whenever the bucket is recreated):
 *   node scripts/set-r2-cors.mjs
 *
 * Requires env vars (or pass inline):
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

const accountId     = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const accessKeyId   = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const secretKey     = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const bucket        = process.env.CLOUDFLARE_R2_BUCKET_NAME

if (!accountId || !accessKeyId || !secretKey || !bucket) {
  console.error('Missing required env vars. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME.')
  process.exit(1)
}

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey: secretKey },
})

const corsConfig = {
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        // Allow direct browser uploads from the production domain
        AllowedOrigins: ['https://cmmschristhood.org'],
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders:  ['ETag'],   // Required for multipart-upload ETag tracking
        MaxAgeSeconds:  3600,
      },
      {
        // Allow localhost for development
        AllowedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders:  ['ETag'],
        MaxAgeSeconds:  3600,
      },
    ],
  },
}

console.log(`Setting CORS on bucket: ${bucket}`)
await r2.send(new PutBucketCorsCommand(corsConfig))
console.log('CORS configured successfully.')

// Verify by reading it back
const result = await r2.send(new GetBucketCorsCommand({ Bucket: bucket }))
console.log('\nCurrent CORS rules:')
console.log(JSON.stringify(result.CORSRules, null, 2))
