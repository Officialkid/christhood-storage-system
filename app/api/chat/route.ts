import { NextRequest }    from 'next/server'
import { getToken }       from 'next-auth/jwt'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildSystemPrompt } from '@/lib/assistant/system-prompt'
import { logger }            from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Gemini client
// The API key is read server-side only — it is never sent to the browser.
// ─────────────────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ─────────────────────────────────────────────────────────────────────────────
// In-memory rate limiter  (20 requests per user per hour)
//
// Using a simple Map<userId, { count, windowStart }>.
// This is deliberately lightweight — the chatbot is a low-traffic internal
// tool.  If the instance restarts the counters reset, which is acceptable.
// Swap for Redis (e.g. Upstash) if you move to a multi-instance setup.
// ─────────────────────────────────────────────────────────────────────────────
const RATE_LIMIT_MAX      = 20          // requests
const RATE_LIMIT_WINDOW   = 60 * 60 * 1000  // 1 hour in ms

interface RateEntry { count: number; windowStart: number }
const rateLimitStore = new Map<string, RateEntry>()

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now   = Date.now()
  const entry = rateLimitStore.get(userId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // First request in this window
    rateLimitStore.set(userId, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message type
// ─────────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 1. Authentication ──────────────────────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const userId = token.id as string

  // ── 2. Rate limiting ───────────────────────────────────────────────────────
  const { allowed, remaining } = checkRateLimit(userId)
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. You have reached the limit of 20 questions per hour. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit':     String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // ── 3. Parse and validate request body ────────────────────────────────────
  let body: { messages?: unknown; currentPage?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { messages, currentPage } = body

  // Validate messages array
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages must be a non-empty array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Validate each message has the correct shape
  const sanitisedMessages: ChatMessage[] = []
  for (const msg of messages) {
    if (
      typeof msg !== 'object' || msg === null ||
      !('role' in msg) || !('content' in msg) ||
      (msg.role !== 'user' && msg.role !== 'assistant') ||
      typeof msg.content !== 'string'
    ) {
      return new Response(
        JSON.stringify({ error: 'Each message must have role ("user"|"assistant") and content (string)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    sanitisedMessages.push({
      role:    msg.role as 'user' | 'assistant',
      // Cap individual message content to 4000 chars to prevent prompt stuffing
      content: (msg.content as string).slice(0, 4000),
    })
  }

  // The last message must be from the user
  const lastMessage = sanitisedMessages[sanitisedMessages.length - 1]
  if (lastMessage.role !== 'user') {
    return new Response(
      JSON.stringify({ error: 'The last message must be from the user' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Validate and cap the message history length (keep last 20 messages)
  const cappedMessages = sanitisedMessages.slice(-20)

  // Validate currentPage
  const page = typeof currentPage === 'string' && currentPage.startsWith('/')
    ? currentPage
    : '/'

  // ── 4. Build system prompt ─────────────────────────────────────────────────
  const userName = (token.name as string | null) ?? (token.username as string | null) ?? 'there'
  const userRole = (token.role as string | null) ?? 'team member'
  const systemPrompt = buildSystemPrompt({ userName, userRole: userRole as 'ADMIN' | 'EDITOR' | 'UPLOADER', currentPage: page })

  // ── 5. Call Gemini and stream the response ────────────────────────────────
  // We use a ReadableStream to pipe SSE chunks back to the client.
  // Each chunk is: "data: <text>\n\n"
  // The stream ends with: "data: [DONE]\n\n"
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: systemPrompt,
          generationConfig: { maxOutputTokens: 600 },
        })

        // Convert message history to Gemini format (all messages except the last)
        const history = cappedMessages.slice(0, -1).map(m => ({
          role:  m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }))

        const chat = model.startChat({ history })
        const result = await chat.sendMessageStream(
          cappedMessages[cappedMessages.length - 1].content
        )

        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) {
            // JSON-encode so special characters survive SSE transport safely.
            sendEvent(JSON.stringify({ text }))
          }
        }

        sendEvent('[DONE]')
      } catch (err) {
        logger.error('ZARA_ERROR', { route: '/api/chat', error: (err as Error)?.message, message: 'Gemini stream error' })
        sendEvent(
          JSON.stringify({
            error:
              'I am having trouble connecting right now — please try again in a moment or contact your admin.',
          })
        )
        sendEvent('[DONE]')
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',          // disables Nginx response buffering (Render uses Nginx)
      'X-RateLimit-Limit':     String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(remaining),
    },
  })
}
