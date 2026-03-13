import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/admin/assistant/export-training-data
// Returns a JSON array of sanitised exchange records suitable for
// fine-tuning or evaluation. No raw user IDs or reversible PII.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id || (token.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pull all USER records with their paired ASSISTANT record (same sessionId + messageIndex)
  const userRecords = await prisma.zaraConversationLog.findMany({
    where:   { messageType: 'USER' },
    orderBy: { createdAt: 'asc' },
    select: {
      sessionId:         true,
      messageIndex:      true,
      intentCategory:    true,
      userMessageCleaned: true,
      toolsTriggered:    true,
      pageContext:       true,
      createdAt:         true,
    },
  })

  // Batch-fetch the matching ASSISTANT records
  // (same sessionId + messageIndex = same exchange)
  type AssistantRow = {
    sessionId:      string
    messageIndex:   number
    actionProposed: string | null
    actionOutcome:  string | null
  }
  const assistantRecords: AssistantRow[] = await prisma.zaraConversationLog.findMany({
    where:   { messageType: 'ASSISTANT' },
    select: {
      sessionId:      true,
      messageIndex:   true,
      actionProposed: true,
      actionOutcome:  true,
    },
  }) as AssistantRow[]

  const assistantMap = new Map<string, AssistantRow>()
  for (const ar of assistantRecords) {
    assistantMap.set(`${ar.sessionId}:${ar.messageIndex}`, ar)
  }

  const exportRows = userRecords.map(ur => {
    const ar = assistantMap.get(`${ur.sessionId}:${ur.messageIndex}`)
    let outcome: string | null = null
    if (ar?.actionProposed) {
      outcome = ar.actionOutcome ?? 'PROPOSED'
    }
    return {
      intent:      ur.intentCategory ?? 'GENERAL_CHAT',
      userMessage: ur.userMessageCleaned ?? '[message not stored]',
      toolsUsed:   ur.toolsTriggered,
      outcome,
      pageContext: ur.pageContext,
      date:        ur.createdAt.toISOString().split('T')[0],
    }
  })

  return new NextResponse(JSON.stringify(exportRows, null, 2), {
    status:  200,
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="zara-training-export-${Date.now()}.json"`,
    },
  })
}
