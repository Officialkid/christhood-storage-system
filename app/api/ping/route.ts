/**
 * GET /api/ping
 *
 * Tiny latency probe used by the upload engine to pick an optimal chunk size
 * before starting a batch upload. Returns immediately with minimal payload.
 */
export async function GET() {
  return new Response('ok', {
    status: 200,
    headers: { 'Cache-Control': 'no-store, no-cache' },
  })
}
