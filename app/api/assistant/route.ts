import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  FunctionCallingMode,
} from '@google/generative-ai'
import { buildSystemPrompt } from '@/lib/assistant/system-prompt'
import {
  checkRateLimit,
  recordRequest,
  RATE_LIMIT_MAX,
  type ErrorType,
} from '@/lib/assistant/telemetry'
import { readToolDeclarations, executeReadTool } from '@/lib/assistant/tools/read-tools'
import { actionToolDeclarations, executeActionTool } from '@/lib/assistant/tools/action-tools'
import { recordToolCall } from '@/lib/assistant/tool-telemetry'
import { getActionWarning } from '@/lib/assistant/safety/action-classifier'
import { logConversationExchange } from '@/lib/assistant/logging/conversation-logger'
import type { AppRole } from '@/types'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Gemini client — initialised once at module level, never re-created per request.
// The API key is read server-side only and is never sent to the browser.
// ─────────────────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface FrontendMessage {
  role:    'user' | 'assistant'
  content: string
}

interface RequestContext {
  userName?:    string
  userRole?:    string
  currentPage?: string
}

interface RequestBody {
  messages?:    unknown
  currentPage?: unknown
  context?:     unknown
  sessionId?:   unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// convertToGeminiHistory
//
// The frontend stores messages as { role: "user" | "assistant", content: string }.
// Gemini requires { role: "user" | "model", parts: [{ text: string }] }.
//
// Rules enforced here:
//   - "assistant" → "model"
//   - content wrapped in parts: [{ text }]
//   - The LAST message (the current user turn) is excluded — it goes into
//     sendMessageStream() directly, not the history array.
//   - History must start with "user" and strictly alternate user → model.
//     If for any reason it doesn't (e.g. two consecutive user messages from
//     a frontend bug) we drop the offending message to avoid a Gemini API error.
// ─────────────────────────────────────────────────────────────────────────────
function convertToGeminiHistory(messages: FrontendMessage[]) {
  // Everything except the last message becomes history
  const historyMessages = messages.slice(0, -1)

  const converted: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []
  let expectedRole: 'user' | 'model' = 'user'

  for (const msg of historyMessages) {
    const geminiRole = msg.role === 'assistant' ? 'model' : 'user'
    if (geminiRole !== expectedRole) {
      // Skip to maintain strict alternation (the offending turn is dropped)
      continue
    }
    converted.push({ role: geminiRole, parts: [{ text: msg.content }] })
    expectedRole = geminiRole === 'user' ? 'model' : 'user'
  }

  return converted
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON response helpers
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(body: object, status: number, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assistant — method not allowed
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  return jsonResponse(
    { error: 'Method not allowed. Use POST.' },
    405,
    { Allow: 'POST' }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assistant
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  // ── 1. Authentication ──────────────────────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    return jsonResponse(
      { error: 'Please log in to use the assistant.' },
      401
    )
  }

  const userId      = token.id as string
  const jwtUserName = (token.name as string | null)
    ?? (token.username as string | null)
    ?? 'Unknown'

  // ── 2. Rate limiting ───────────────────────────────────────────────────────
  const { allowed, remaining } = checkRateLimit(userId, jwtUserName)
  if (!allowed) {
    recordRequest({ userId, userName: jwtUserName, durationMs: 0, hadError: true, errorType: 'RATE_LIMIT', errorMsg: 'User rate limit exceeded', rateLimited: true })
    return jsonResponse(
      { error: "You've sent a lot of messages! Take a breath and try again in an hour. 😄" },
      429,
      {
        'X-RateLimit-Limit':     String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': '0',
      }
    )
  }

  // ── 3. Parse and validate request body ────────────────────────────────────
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { messages, currentPage, context } = body
  // sessionId is generated by the ChatbotWidget and passed through so we can
  // group conversation log records. Falls back to a server-generated UUID.
  const sessionId = (typeof body.sessionId === 'string' && body.sessionId.length > 0)
    ? body.sessionId
    : crypto.randomUUID()

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(
      { error: 'messages must be a non-empty array.' },
      400
    )
  }

  // Validate and sanitise each message
  const sanitised: FrontendMessage[] = []
  for (const msg of messages) {
    if (
      typeof msg !== 'object' || msg === null ||
      !('role'    in msg) || !('content' in msg) ||
      (msg.role !== 'user' && msg.role !== 'assistant') ||
      typeof msg.content !== 'string'
    ) {
      return jsonResponse(
        { error: 'Each message must have role ("user"|"assistant") and content (string).' },
        400
      )
    }
    sanitised.push({
      role:    msg.role as 'user' | 'assistant',
      content: (msg.content as string).slice(0, 4_000), // prevent prompt stuffing
    })
  }

  // Last message must be from the user
  if (sanitised[sanitised.length - 1].role !== 'user') {
    return jsonResponse(
      { error: 'The last message must be from the user.' },
      400
    )
  }

  // Cap history to the last 20 messages to control token usage
  const cappedMessages = sanitised.slice(-20)

  // ── 4. Resolve page and user context ──────────────────────────────────────
  // Prefer values from the optional request context object, fall back to JWT.
  const ctx = (typeof context === 'object' && context !== null)
    ? context as RequestContext
    : {}

  const page = (
    typeof ctx.currentPage === 'string' && ctx.currentPage.startsWith('/')
      ? ctx.currentPage
      : typeof currentPage === 'string' && (currentPage as string).startsWith('/')
        ? currentPage as string
        : '/'
  )

  const userName = ctx.userName ?? jwtUserName

  const userRole = ctx.userRole
    ?? (token.role as string | null)
    ?? 'team member'

  // ── 5. Build caller context for tool execution ──────────────────────────────
  const caller = {
    userId,
    userName,
    role: ((token.role as AppRole | null) ?? 'UPLOADER') as AppRole,
  }

  // ── 6. Build system prompt ─────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({ currentPage: page, userName, userRole })

  // ── 7. Prepare Gemini history and current user message ────────────────────
  const geminiHistory = convertToGeminiHistory(cappedMessages)
  const latestMessage = cappedMessages[cappedMessages.length - 1].content

  // ── 8. Stream response via SSE ────────────────────────────────────────────
  // Format: data: {"token":"Hello"}\n\n  ...  data: [DONE]\n\n
  const encoder     = new TextEncoder()
  const requestStart = Date.now()

  // ── Per-exchange tracking (populated inside the stream, used in finally) ──
  // These are declared in the outer POST scope so they're reachable from the
  // finally block after the ReadableStream resolves.
  let exchangeTools:        string[] = []
  let exchangeActionProposed: string | null = null
  let exchangeResponseText: string  = ''
  // Derive the user's 1-based message index from the capped history
  const exchangeMessageIndex = cappedMessages.filter(m => m.role === 'user').length

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) =>
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))

      let hadError  = false
      let errType: ErrorType | undefined
      let errMsg    = ''

      const sendError = (message: string, type: ErrorType = 'UNKNOWN') => {
        hadError = true
        errType  = type
        errMsg   = message
        send(JSON.stringify({ error: message }))
        send('[DONE]')
      }

      try {
        const allTools = [...readToolDeclarations, ...actionToolDeclarations]

        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: allTools }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingMode.AUTO,
            },
          },
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.7,
          },
        })

        const chat = model.startChat({ history: geminiHistory })
        // sendMessage returns GenerateContentResult; the actual response payload
        // is on .response (GenerateContentResponse).
        let genResult = await chat.sendMessage(latestMessage)

        // ── Tool call orchestration loop ──────────────────────────────────────
        // Keeps processing until Gemini returns a text response (not a tool call).
        // Capped at 10 iterations to guard against runaway loops on unexpected
        // API behaviour (e.g. a tool that repeatedly triggers another tool call).
        let iterations = 0
        while (iterations < 10) {
          iterations++
          const geminiRes   = genResult.response
          const candidate   = geminiRes.candidates?.[0]
          const finishReason = candidate?.finishReason
          const blockReason  = geminiRes.promptFeedback?.blockReason

          // Safety block — stream a gentle note then end
          if (finishReason === 'SAFETY' || blockReason) {
            send(JSON.stringify({
              token: "\n\n*I wasn't able to respond to that. Could you try rephrasing your question?*",
            }))
            send('[DONE]')
            break
          }

          // Check whether Gemini wants to call a tool.
          // Cast parts to any[] — Part is a discriminated union and the predicate
          // below narrows correctly at runtime; the cast avoids noisy TS gymnastics.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parts: any[] = candidate?.content?.parts ?? []
          const functionCallPart = parts.find(
            (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
              'functionCall' in p && !!p.functionCall,
          )

          if (functionCallPart) {
            const { name, args } = functionCallPart.functionCall
            const isActionTool   = actionToolDeclarations.some(t => t.name === name)

            // Track which tools were called during this exchange
            if (!exchangeTools.includes(name)) exchangeTools.push(name)

            // Notify the UI that a tool is being called so it can show a pill
            send(JSON.stringify({ type: 'tool_executing', toolName: name }))

            let toolResult: unknown
            const toolStart = Date.now()

            if (isActionTool) {
              const actionResult = await executeActionTool(
                name,
                args as Record<string, unknown>,
                caller,
              )

              if (actionResult.requiresConfirmation) {
                // Proposal phase — stream the confirmation card and stop here.
                // The action only executes when the user confirms via
                // POST /api/assistant/confirm with the returned pendingActionId.
                exchangeActionProposed = name
                recordToolCall({
                  timestamp:     new Date().toISOString(),
                  toolName:      name,
                  args:          args as Record<string, unknown>,
                  resultSummary: `Confirmation required`,
                  userId:        caller.userId,
                  userName:      caller.userName,
                  responseMs:    Date.now() - toolStart,
                  isError:       false,
                })
                send(JSON.stringify({
                  type:            'confirmation_required',
                  message:         actionResult.confirmationMessage,
                  pendingActionId: actionResult.pendingAction.id,
                  actionWarning:   getActionWarning(name, args as Record<string, unknown>),
                }))
                send('[DONE]')
                break
              }

              // Inline result: flagIssueToAdmin succeeded, or a role-check error
              toolResult = 'result' in actionResult
                ? { outcome: actionResult.result }
                : { error:   actionResult.error }

              recordToolCall({
                timestamp:     new Date().toISOString(),
                toolName:      name,
                args:          args as Record<string, unknown>,
                resultSummary: 'result' in actionResult
                  ? (actionResult.result?.slice(0, 120) ?? 'ok')
                  : `error: ${actionResult.error?.slice(0, 120) ?? 'unknown'}`,
                userId:        caller.userId,
                userName:      caller.userName,
                responseMs:    Date.now() - toolStart,
                isError:       !('result' in actionResult),
              })

            } else {
              toolResult = await executeReadTool(
                name,
                args as Record<string, unknown>,
                caller,
              )

              // Summarise the read result for the telemetry log
              const resultObj = toolResult as Record<string, unknown>
              let summary: string
              if ('error' in resultObj) {
                summary = `error: ${String(resultObj.error).slice(0, 120)}`
              } else {
                const arrayKey = Object.keys(resultObj).find(k => Array.isArray(resultObj[k]))
                if (arrayKey) {
                  summary = `${(resultObj[arrayKey] as unknown[]).length} ${arrayKey} returned`
                } else {
                  summary = `${Object.keys(resultObj).length} field(s) returned`
                }
              }

              recordToolCall({
                timestamp:     new Date().toISOString(),
                toolName:      name,
                args:          args as Record<string, unknown>,
                resultSummary: summary,
                userId:        caller.userId,
                userName:      caller.userName,
                responseMs:    Date.now() - toolStart,
                isError:       'error' in resultObj,
              })
            }

            // Return the tool result to Gemini and continue the loop
            genResult = await chat.sendMessage([{
              functionResponse: {
                name,
                response: { result: toolResult },
              },
            }])

          } else {
            // Gemini returned a text response — stream it character by character
            const text = parts
              .filter((p) => 'text' in p && typeof p.text === 'string')
              .map((p) => p.text as string)
              .join('')

            if (text) {
              for (const char of text) {
                send(JSON.stringify({ token: char }))
              }
              // Capture for the conversation log (assembled after streaming completes)
              exchangeResponseText = text
            } else {
              send(JSON.stringify({
                token: "I'm sorry, I wasn't able to generate a response. Please try again.",
              }))
            }

            send('[DONE]')
            break
          }
        }

        // Safety valve: exhausted iterations without Gemini returning text
        // (should never happen in practice — indicates an API anomaly)
        if (iterations >= 10) {
          send(JSON.stringify({ token: "I had trouble processing that. Please try again." }))
          send('[DONE]')
        }

      } catch (err) {

        // ── Gemini HTTP errors (API key, rate limit, server errors) ───────────
        if (err instanceof GoogleGenerativeAIFetchError) {
          const status = err.status ?? 0

          console.error('[/api/assistant] GEMINI_FETCH_ERROR:', {
            status,
            message: err.message,
            errorType: err.constructor?.name,
          })

          if (status === 401 || status === 403) {
            sendError("The assistant isn't configured correctly. Please contact your admin.", 'AUTH_ERROR')

          } else if (status === 429) {
            // Distinguish between Gemini's daily quota and Gemini's per-minute RPM limit.
            // Quota errors come back with RESOURCE_EXHAUSTED in the message body.
            const isQuota = err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota')
            sendError(
              isQuota
                ? "Zara's daily free-tier quota has been reached. She'll be available again tomorrow, or ask your admin to upgrade the Gemini plan at aistudio.google.com. 📅"
                : "I'm a bit busy right now — please try again in a minute! 😊",
              'RATE_LIMIT',
            )

          } else if (status === 400) {
            // 400 from Gemini means the API key was rejected
            sendError("The assistant isn't configured correctly. Please contact your admin.", 'AUTH_ERROR')

          } else if (status === 0 || err.message.toLowerCase().includes('fetch')) {
            // status 0 = network-level failure (DNS, TCP, etc.)
            sendError("I'm having trouble connecting right now. Please try again in a moment.", 'NETWORK_ERROR')

          } else {
            // 500, 503, or other server-side Gemini errors
            sendError("I'm having trouble connecting right now. Please try again in a moment.", 'SERVER_ERROR')
          }

        // ── Gemini response errors (safety block thrown as exception) ─────────
        } else if (err instanceof GoogleGenerativeAIResponseError) {
          console.error('[/api/assistant] GEMINI_RESPONSE_ERROR:', { message: err.message })
          sendError("I wasn't able to respond to that one. Try rephrasing your question!", 'SAFETY_FILTER')

        // ── Network / fetch-level errors not wrapped by the SDK ───────────────
        } else if (
          (err instanceof TypeError || err instanceof Error) &&
          (err.message.toLowerCase().includes('fetch') ||
           err.message.includes('ECONNREFUSED') ||
           err.message.includes('ENOTFOUND') ||
           err.name === 'FetchError')
        ) {
          console.error('[/api/assistant] GEMINI_NETWORK_ERROR:', { message: err.message, name: err.name })
          sendError("I'm having trouble connecting right now. Please try again in a moment.", 'NETWORK_ERROR')

        // ── Anything else ─────────────────────────────────────────────────────
        } else {
          console.error('[/api/assistant] GEMINI_UNKNOWN_ERROR:', {
            errorType: (err as Error).constructor?.name ?? typeof err,
            message:   (err as Error).message,
          })
          sendError("Something went wrong on my end. Please try again — and if it keeps happening, let your admin know.", 'UNKNOWN')
        }

      } finally {
        // ── Fire-and-forget conversation log ─────────────────────────────────
        // Swallow ALL errors — logging must never block or break the response.
        const _logPromise = logConversationExchange({
          sessionId,
          userId,
          userRole,
          pageContext:     page,
          messageIndex:    exchangeMessageIndex,
          userMessage:     latestMessage,
          toolsTriggered:  exchangeTools,
          assistantResponse: exchangeResponseText,
          responseTimeMs:  Date.now() - requestStart,
          usedToolData:    exchangeTools.some(t =>
            ['searchFiles','getEventContents','getUserActivity','getFileDetails',
             'getRecentActivity','getStorageStats','getTrashContents','findUser',
             'getTransferStatus'].includes(t)
          ),
          actionProposed:  exchangeActionProposed,
        }).catch(() => { /* silently ignore */ })
        void _logPromise

        recordRequest({
          userId,
          userName,
          durationMs:  Date.now() - requestStart,
          hadError,
          errorType:   errType,
          errorMsg:    errMsg || undefined,
          rateLimited: false,
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':          'text/event-stream',
      'Cache-Control':         'no-cache, no-transform',
      'Connection':            'keep-alive',
      'X-Accel-Buffering':     'no',  // prevents Nginx (used by Render) buffering the stream
      'X-RateLimit-Limit':     String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(remaining),
    },
  })
}
