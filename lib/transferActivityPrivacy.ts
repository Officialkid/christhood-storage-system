import { prisma } from '@/lib/prisma'

const TRANSFER_ACTIONS = new Set([
  'TRANSFER_SENT',
  'TRANSFER_DOWNLOADED',
  'TRANSFER_RESPONDED',
  'TRANSFER_RESPONSE_DOWNLOADED',
  'TRANSFER_COMPLETED',
  'TRANSFER_CANCELLED',
  'TRANSFER_PURGED',
  'TRANSFER_INTEGRITY_FAILURE',
])

type ActivityLike = {
  action: string
  metadata?: unknown
}

function readTransferId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null
  const value = (meta as { transferId?: unknown }).transferId
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Private transfer activity is visible only to transfer participants:
 * sender and recipient.
 */
export async function filterTransferActivityForViewer<T extends ActivityLike>(
  entries: T[],
  viewerId: string,
): Promise<T[]> {
  if (entries.length === 0) return entries

  const ids = new Set<string>()
  for (const e of entries) {
    if (!TRANSFER_ACTIONS.has(e.action)) continue
    const transferId = readTransferId(e.metadata)
    if (transferId) ids.add(transferId)
  }

  if (ids.size === 0) {
    return entries.filter((e) => !TRANSFER_ACTIONS.has(e.action))
  }

  const transfers = await prisma.transfer.findMany({
    where: { id: { in: Array.from(ids) } },
    select: { id: true, senderId: true, recipientId: true },
  })

  const byId = new Map(transfers.map((t) => [t.id, t]))

  return entries.filter((e) => {
    if (!TRANSFER_ACTIONS.has(e.action)) return true
    const transferId = readTransferId(e.metadata)
    if (!transferId) return false
    const t = byId.get(transferId)
    if (!t) return false
    return t.senderId === viewerId || t.recipientId === viewerId
  })
}
