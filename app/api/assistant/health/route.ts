// GET /api/assistant/health
//
// Called by ChatbotWidget when the chat panel opens to verify the Gemini
// connection is working before the user sends their first message.
// Makes a minimal live test call so both the API key and network are verified.
//
// No authentication required — reveals only service availability, no user data.
// Result is cached in memory for 60 seconds to prevent Gemini ping spam.

import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache — one slot, 60-second TTL
// ─────────────────────────────────────────────────────────────────────────────
interface CacheEntry {
  body:      string   // pre-serialised JSON so we never re-serialise
  status:    number
  expiresAt: number
}

let cache: CacheEntry | null = null

const CACHE_TTL_MS  = 60_000   // 60 seconds
const TIMEOUT_MS    =  8_000   //  8 seconds

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function ok200(model: string): CacheEntry {
  return {
    body:      JSON.stringify({ status: 'ok', model, message: 'Connected', timestamp: new Date().toISOString() }),
    status:    200,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
}

/** detail is the human-readable action the admin should take; shown in the debug panel. */
function err503(message: string, detail?: string): CacheEntry {
  return {
    body:      JSON.stringify({ status: 'error', message, detail: detail ?? message }),
    status:    503,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
}

function respond(entry: CacheEntry) {
  return new Response(entry.body, {
    status:  entry.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assistant/health
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  // ── 1. Serve from cache if still fresh ────────────────────────────────────
  if (cache && Date.now() < cache.expiresAt) {
    return respond(cache)
  }

  // ── 2. Verify API key is configured ───────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    cache = err503(
      'API key not configured',
      'Set GEMINI_API_KEY in Cloud Run: Edit & Deploy New Revision → Variables & Secrets tab → deploy.',
    )
    return respond(cache)
  }

  // ── 2b. Basic format check — Gemini keys always start with "AIza" ─────────
  if (!apiKey.startsWith('AIza')) {
    cache = err503(
      'API key format invalid',
      'Gemini API keys must start with "AIza". Get a new key at https://aistudio.google.com/app/apikey',
    )
    return respond(cache)
  }

  // ── 3. Live test call — race against a 5-second timeout ───────────────────
  const MODEL = 'gemini-2.0-flash'

  const geminiCall = async () => {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { maxOutputTokens: 5 },
    })
    // Minimal prompt — we only care that we get *any* response back.
    await model.generateContent('Reply with only the word: OK')
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  )

  try {
    await Promise.race([geminiCall(), timeout])
    cache = ok200(MODEL)
    return respond(cache)

  } catch (err) {
    const isFetchErr = err instanceof GoogleGenerativeAIFetchError
    const httpStatus = isFetchErr ? (err.status ?? 0) : 0

    // Structured log — visible in Cloud Console → Cloud Run → Logs
    console.error('[/api/assistant/health] GEMINI_HEALTH_CHECK_FAILED:', {
      errorType: (err as Error).constructor?.name ?? typeof err,
      message:   (err as Error).message,
      status:    isFetchErr ? err.status : undefined,
      stack:     (err as Error).stack?.split('\n')[0],
    })

    // ── 401 / 403 — key rejected by Google ───────────────────────────────────
    if (isFetchErr && (httpStatus === 401 || httpStatus === 403)) {
      cache = err503(
        'API key does not have permission',
        'The key was rejected by Google. Verify the Generative Language API is enabled and the key has no restrictions. Get a new key at https://aistudio.google.com/app/apikey',
      )
      return respond(cache)
    }

    // ── 400 — key is correctly formatted but invalid / revoked ───────────────
    if (isFetchErr && httpStatus === 400) {
      cache = err503(
        'API key invalid or revoked (HTTP 400)',
        'The key was recognised but rejected. It may have been deleted or regenerated. Get a current key at https://aistudio.google.com/app/apikey then update GEMINI_API_KEY in Cloud Run: Edit & Deploy New Revision → Variables & Secrets.',
      )
      return respond(cache)
    }

    // ── 429 — free-tier quota exhausted (key IS valid) ───────────────────────
    if (isFetchErr && httpStatus === 429) {
      cache = err503(
        'Gemini free-tier quota exceeded',
        'Daily request limit reached. Zara will be available again tomorrow, or upgrade to a paid Gemini plan at https://aistudio.google.com',
      )
      return respond(cache)
    }

    // ── Explicit timeout ─────────────────────────────────────────────────────
    if (err instanceof Error && err.message === 'TIMEOUT') {
      cache = err503(
        'Gemini API timed out (8 s)',
        'No response from generativelanguage.googleapis.com within 8 seconds. Cloud Run has unrestricted outbound access — the Gemini API itself may be temporarily unavailable. Try again in a moment.',
      )
      return respond(cache)
    }

    // ── Network / DNS / fetch failed (status 0) ──────────────────────────────
    if (
      (isFetchErr && httpStatus === 0) ||
      (err instanceof TypeError && err.message.toLowerCase().includes('fetch'))
    ) {
      cache = err503(
        `Cannot reach Gemini API — ${(err as Error).message ?? 'fetch failed'}`,
        'Network error reaching generativelanguage.googleapis.com from Cloud Run. Verify the service account has internet access: Cloud Console → Cloud Run → your service → Security tab.',
      )
      return respond(cache)
    }

    // ── Fallback ─────────────────────────────────────────────────────────────
    cache = err503(
      `Gemini error: ${(err as Error).message ?? 'unknown'}`,
      'Check logs: Cloud Console → Cloud Run → your service → Logs tab → search GEMINI_HEALTH_CHECK_FAILED.',
    )
    return respond(cache)
  }
}

