import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/r2'

/**
 * Deletes a MediaFile's primary R2 object, thumbnail (if any), and all FileVersion R2 objects,
 * then atomically marks the MediaFile as PURGED and removes its TrashItem record.
 */
export async function purgeTrashedMediaFile(trashItemId: string, mediaFileId: string, now = new Date()): Promise<void> {
  const mediaFile = await prisma.mediaFile.findUnique({
    where:   { id: mediaFileId },
    include: { versions: { select: { r2Key: true } } },
  })

  if (mediaFile) {
    const keysToDelete = new Set<string>([mediaFile.r2Key])
    if (mediaFile.thumbnailKey) keysToDelete.add(mediaFile.thumbnailKey)
    for (const v of mediaFile.versions) {
      if (v.r2Key) keysToDelete.add(v.r2Key)
    }

    for (const key of keysToDelete) {
      try {
        await deleteObject(key)
      } catch {
        // Continue if an auxiliary object (e.g. thumbnail) was already missing
      }
    }
  }

  await prisma.$transaction([
    prisma.mediaFile.update({
      where: { id: mediaFileId },
      data:  { status: 'PURGED' as any, purgedAt: now } as any,
    }),
    prisma.trashItem.delete({ where: { id: trashItemId } }),
  ])
}
