/**
 * Conversation Logger for Zara AI Assistant.
 *
 * Writes two ZaraConversationLog records per exchange (USER + ASSISTANT) in a
 * fire-and-forget manner. Errors are swallowed so logging never interrupts the
 * user-facing response stream.
 *
 * Privacy guarantees:
 *  - userId is one-way hashed via SHA-256 before storage
 *  - user message run through PII sanitizer before storage
 *  - users who opted out are skipped entirely
 *  - all records auto-expire after RETENTION_DAYS
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sanitizeMessage } from './pii-sanitizer'
import { classifyIntent, type IntentCategory } from './intent-classifier'

const RETENTION_DAYS = 90

export interface LogExchangeParams {
  /** Server-generated or widget-generated session ID */
  sessionId: string
  /** Real userId from the JWT — will be hashed before storage */
  userId: string
  /** Role string from context (UPLOADER | EDITOR | ADMIN) */
  userRole: string
  /** Page pathname at the time of the message */
  pageContext: string
  /** 1-based index of this exchange in the session */
  messageIndex: number
  /** Raw user message text (PII will be stripped here) */
  userMessage: string
  /** Tool names that were called during this exchange */
  toolsTriggered: string[]
  /** Full assistant response text */
  assistantResponse: string
  /** Gemini latency in ms */
  responseTimeMs: number
  /** Whether any read-tool supplied live data */
  usedToolData: boolean
  /** Tool name if an action card was shown, otherwise null */
  actionProposed: string | null
  /** Result of the action confirmation (set after the fact if available) */
  actionOutcome?: 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | null
  /** Whether to flag this exchange as OFF_TOPIC */
  isOffTopic?: boolean
}

/** Hash userId to an opaque anonymous identifier */
function anonymise(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex')
}

/** Normalise role to the three stored categories */
function normaliseRole(role: string): string {
  const r = role.toUpperCase()
  if (r.includes('ADMIN'))    return 'ADMIN'
  if (r.includes('EDITOR'))   return 'EDITOR'
  return 'UPLOADER'
}

/**
 * Fetch known first/last names from the user table so the PII sanitizer can
 * replace them. Returns an empty array on any DB error — better to miss a name
 * than to crash the logger.
 */
async function fetchKnownNames(): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({ select: { name: true } })
    return users
      .flatMap(u => (u.name ?? '').split(/\s+/))
      .filter(n => n.length > 2)
  } catch {
    return []
  }
}

/**
 * Log a complete exchange (user message + assistant response).
 *
 * Call this fire-and-forget:
 *   void logConversationExchange(params).catch(() => {})
 */
export async function logConversationExchange(params: LogExchangeParams): Promise<void> {
  const {
    sessionId, userId, userRole, pageContext, messageIndex,
    userMessage, toolsTriggered, assistantResponse,
    responseTimeMs, usedToolData, actionProposed,
    actionOutcome = null, isOffTopic = false,
  } = params

  // Skip if the user opted out
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { zaraLoggingOptOut: true },
  })
  if (user?.zaraLoggingOptOut) return

  const knownNames   = await fetchKnownNames()
  const cleanMessage = sanitizeMessage(userMessage, knownNames)
  const intent: IntentCategory = isOffTopic
    ? 'OFF_TOPIC'
    : classifyIntent(cleanMessage)

  const anonymousUserId   = anonymise(userId)
  const normRole          = normaliseRole(userRole)
  const expiresAt         = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const hasToolData       = usedToolData || toolsTriggered.length > 0
  const actionWasProposed = actionProposed !== null

  await prisma.zaraConversationLog.createMany({
    data: [
      // ── USER record ──────────────────────────────────────────────────────
      {
        sessionId,
        anonymousUserId,
        userRoleCategory:   normRole,
        pageContext,
        messageIndex,
        messageType:        'USER',
        userMessageCleaned: cleanMessage,
        toolsTriggered,
        intentCategory:     intent,
        createdAt:          new Date(),
        retentionExpiresAt: expiresAt,
      },
      // ── ASSISTANT record ─────────────────────────────────────────────────
      {
        sessionId,
        anonymousUserId,
        userRoleCategory:   normRole,
        pageContext,
        messageIndex,
        messageType:        'ASSISTANT',
        toolsTriggered,
        responseSummary:    assistantResponse.slice(0, 200),
        responseTimeMs,
        usedToolData:       hasToolData,
        actionProposed,
        actionOutcome,
        qualitySignals: {
          wasAnswered:            assistantResponse.length > 0,
          usedLiveData:           hasToolData,
          actionWasProposed,
          actionWasConfirmed:     actionOutcome === 'CONFIRMED',
          followUpMessageCount:   0,
          sessionEndedAbruptly:   false,
        },
        createdAt:          new Date(),
        retentionExpiresAt: expiresAt,
      },
    ],
  })
}
