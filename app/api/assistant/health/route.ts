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
const TIMEOUT_MS    =  5_000   //  5 seconds

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function ok200(model: string): CacheEntry {
  return {
    body:      JSON.stringify({ status: 'ok', model, timestamp: new Date().toISOString() }),
    status:    200,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
}

function err503(message: string): CacheEntry {
  return {
    body:      JSON.stringify({ status: 'error', message }),
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
    cache = err503('API key not configured')
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
    // ── Auth error: invalid or disabled API key ──────────────────────────────
    if (
      err instanceof GoogleGenerativeAIFetchError &&
      (err.status === 401 || err.status === 403)
    ) {
      console.error('[/api/assistant/health] GEMINI_AUTH_ERROR:', err.message)
      cache = err503('Invalid API key — contact admin')
      return respond(cache)
    }

    // ── Explicit timeout ─────────────────────────────────────────────────────
    if (err instanceof Error && err.message === 'TIMEOUT') {
      console.error('[/api/assistant/health] GEMINI_TIMEOUT: no response within 5 s')
      cache = err503('AI service response timeout')
      return respond(cache)
    }

    // ── Network / DNS / any other reachability error ─────────────────────────
    console.error('[/api/assistant/health] GEMINI_UNREACHABLE:', err)
    cache = err503('AI service temporarily unavailable')
    return respond(cache)
  }
}

