/**
 * GET /api/gallery/test-sharp
 *
 * Diagnostic endpoint — verifies that Sharp is installed and the native
 * binaries are loaded correctly in the current runtime environment.
 *
 * Usage during incident triage:
 *   curl https://your-app-url/api/gallery/test-sharp
 *
 * Expected response when everything is fine:
 *   { "status": "ok", "sharpWorking": true, "size": <bytes> }
 *
 * If Sharp is broken:
 *   { "status": "error", "message": "<error detail>" }
 *
 * This endpoint is intentionally unauthenticated so it can be hit from curl
 * during a Cloud Run incident without a session cookie.
 * It is read-only and does not write to any database or storage bucket.
 */

import sharp from 'sharp'

export async function GET() {
  try {
    const buffer = await sharp({
      create: {
        width:      10,
        height:     10,
        channels:   3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()

    return Response.json({
      status:       'ok',
      sharpWorking: true,
      size:         buffer.length,
      sharpVersion: sharp.versions,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return Response.json(
      { status: 'error', sharpWorking: false, message },
      { status: 500 },
    )
  }
}
