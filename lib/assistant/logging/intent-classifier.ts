/**
 * Intent Classifier for Zara conversation logging.
 *
 * Classifies a user message into one of the known intent categories using
 * simple keyword matching. Fast, deterministic, no external calls.
 */

export type IntentCategory =
  | 'HOW_TO'
  | 'FIND_FILE'
  | 'STATUS_CHECK'
  | 'ERROR_REPORT'
  | 'ACTION_REQUEST'
  | 'ACCOUNT_ISSUE'
  | 'OFF_TOPIC'
  | 'GENERAL_CHAT'

type Rule = { intent: IntentCategory; keywords: string[] }

const RULES: Rule[] = [
  {
    intent:   'HOW_TO',
    keywords: ['how do i', 'how to', 'what is', 'what are', 'explain', 'help me understand', 'show me how', 'guide me', 'tutorial'],
  },
  {
    intent:   'FIND_FILE',
    keywords: ['find', 'where is', 'search for', 'look for', 'locate', 'show me the file', 'where can i find', 'can you find'],
  },
  {
    intent:   'STATUS_CHECK',
    keywords: ['what is the status', 'has it been', 'is it ready', 'current status', "what's the status", 'been approved', 'been processed', 'been uploaded'],
  },
  {
    intent:   'ERROR_REPORT',
    keywords: ['error', 'broken', 'not working', "can't", 'cannot', 'failed', 'problem', 'issue with', 'something went wrong', 'keeps failing', 'crashing', "doesn't work"],
  },
  {
    intent:   'ACTION_REQUEST',
    keywords: ['can you', 'please', 'restore', 'reset', 'create', 'change', 'update', 'delete', 'rename', 'move', 'set', 'make', 'archive', 'upload', 'download'],
  },
  {
    intent:   'ACCOUNT_ISSUE',
    keywords: ['login', 'log in', 'password', 'locked', 'access', 'permission', 'sign in', 'forgot', 'locked out', 'unauthorized'],
  },
]

/**
 * Classify the intent of a (already-sanitized) user message.
 *
 * Returns 'GENERAL_CHAT' when no rule matches.
 * 'OFF_TOPIC' is never auto-assigned here — it is set externally by the
 * assistant route when Zara's response indicates out-of-scope content.
 */
export function classifyIntent(message: string): IntentCategory {
  const lower = message.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.intent
    }
  }
  return 'GENERAL_CHAT'
}
