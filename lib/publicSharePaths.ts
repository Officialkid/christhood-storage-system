const SAFE_SEGMENT_RE = /[^a-zA-Z0-9._\-() ]+/g

function cleanSegment(segment: string): string {
  return segment
    .trim()
    .replace(SAFE_SEGMENT_RE, '_')
    .replace(/\.\.+/g, '_')
    .replace(/\s+/g, ' ')
}

export function normalizeFolderPath(folderPath?: string | null): string | null {
  if (!folderPath) return null

  const parts = folderPath
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(part => part && part !== '.' && part !== '..')
    .map(cleanSegment)
    .filter(Boolean)

  if (!parts.length) return null
  return parts.join('/')
}

export function sanitizeShareFilename(filename: string): string {
  return cleanSegment(filename).replace(/\/+/g, '_').slice(0, 500) || 'file'
}

export function buildPublicShareR2Key(token: string, filename: string, folderPath?: string | null): string {
  const normalizedFolder = normalizeFolderPath(folderPath)
  const folderPrefix = normalizedFolder ? `${normalizedFolder}/` : ''
  return `public-shares/${token}/${folderPrefix}${sanitizeShareFilename(filename)}`
}

