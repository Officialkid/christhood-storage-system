export type PublicShareTransferItem = {
  originalName: string
  folderPath: string | null
}

function slugPiece(value: string): string {
  return value
    .replace(/\.[^/.]+$/, '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeTransferLabel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Shared files'
}

export function deriveTransferLabel(
  preferredTitle: string | null | undefined,
  files: PublicShareTransferItem[],
): string {
  if (preferredTitle?.trim()) {
    return sanitizeTransferLabel(preferredTitle)
  }

  const firstFolder = files
    .map(file => file.folderPath?.split('/').filter(Boolean)[0] ?? null)
    .find(Boolean)

  if (firstFolder) {
    return sanitizeTransferLabel(firstFolder)
  }

  if (files.length === 1) {
    return sanitizeTransferLabel(slugPiece(files[0].originalName))
  }

  return 'Shared files'
}

export function buildTransferCode(transferToken: string): string {
  return transferToken.replace(/-/g, '').slice(0, 12).toLowerCase()
}

export function buildTransferArchivePath(
  bundleName: string,
  folderPath: string | null,
  originalName: string,
): string {
  const parts = [bundleName]
  const folderParts = folderPath?.split('/').filter(Boolean) ?? []

  if (folderParts[0]?.toLowerCase() === bundleName.toLowerCase()) {
    folderParts.shift()
  }

  parts.push(...folderParts, originalName)
  return parts.join('/')
}
