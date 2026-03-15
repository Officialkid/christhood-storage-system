/**
 * Upload naming utilities.
 *
 * Files retain their original device filename — no event-category renaming.
 */

/**
 * Remove characters that are unsafe in filenames and URL paths while keeping
 * the name human-readable.
 *
 * Allowed: word chars (a-z A-Z 0-9 _), spaces, hyphens, dots, parens, brackets.
 */
export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^\w\s\-_.()[\]]/g, '')
}

/** R2 object key for event uploads: events/<eventId>/<sanitized-filename> */
export function makeEventR2Key(eventId: string, filename: string): string {
  return `events/${eventId}/${sanitizeFilename(filename)}`
}
