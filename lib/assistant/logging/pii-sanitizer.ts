/**
 * PII Sanitizer for Zara conversation logging.
 *
 * Removes personally-identifiable information from user messages before they
 * are stored in ZaraConversationLog. The sanitized version is stored; the
 * original message is never persisted.
 *
 * Removal rules (applied in order):
 *  1. Email addresses       → [EMAIL]
 *  2. Phone numbers         → [PHONE]
 *  3. Kenyan ID numbers     → [ID_NUMBER]  (8-digit standalone numbers)
 *  4. Password attempts     → [REDACTED]
 */

const EMAIL_RE   = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const PHONE_RE   = /(\+?254|0)[17]\d{8}|\(\d{3}\)\s?\d{3}[-.\s]\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g
const KE_ID_RE   = /\b\d{8}\b/g
const PWD_RE     = /\b(password|passwd|pwd|pass)\s*[:=\s]+\S+/gi
const NAME_RE    = (names: string[]) =>
  new RegExp(`\\b(${names.map(n => escapeRe(n)).join('|')})\\b`, 'gi')

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sanitize a single message string.
 *
 * @param text   Raw user message
 * @param knownNames  List of real names known from the user table (optional)
 */
export function sanitizeMessage(text: string, knownNames: string[] = []): string {
  let out = text
  out = out.replace(EMAIL_RE,  '[EMAIL]')
  out = out.replace(PHONE_RE,  '[PHONE]')
  out = out.replace(KE_ID_RE,  '[ID_NUMBER]')
  out = out.replace(PWD_RE,    '[REDACTED]')
  if (knownNames.length > 0) {
    out = out.replace(NAME_RE(knownNames), '[PERSON_NAME]')
  }
  return out.trim()
}
